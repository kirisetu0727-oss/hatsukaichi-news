"""
廿日市市ニュース収集スクリプト
毎日AM6時(JST)にGitHub Actionsから実行される
"""

import os
import json
import hashlib
import time
import re
import logging
from datetime import datetime, timezone, timedelta
from difflib import SequenceMatcher
from pathlib import Path
from typing import Optional

import feedparser
import requests
from bs4 import BeautifulSoup
import google.generativeai as genai
from concurrent.futures import ThreadPoolExecutor, as_completed

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

JST = timezone(timedelta(hours=9))
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "docs" / "data"
DATA_DIR.mkdir(exist_ok=True)

ARTICLES_PATH = DATA_DIR / "articles.json"
PROCESSED_IDS_PATH = DATA_DIR / ".processed_ids.json"

HEADERS = {
    "User-Agent": "HatsukaichiNewsBot/1.0 (+https://github.com/hatsukaichi-news)"
}
REQUEST_TIMEOUT = 10
MAX_ARTICLES_PER_RUN = 80
ARTICLES_KEEP_DAYS = 30
SIMILARITY_THRESHOLD = 0.85


def load_json(path: Path, default):
    if path.exists():
        with open(path, encoding="utf-8-sig") as f:
            return json.load(f)
    return default


def save_json_atomic(path: Path, data):
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def now_jst() -> datetime:
    return datetime.now(JST)


def make_id(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()[:16]


def normalize_url(url: str) -> str:
    url = re.sub(r"^http://", "https://", url)
    url = re.sub(r"\?.*$", "", url)
    url = url.rstrip("/")
    return url


def matches_keywords(text: str, keywords: dict) -> bool:
    combined = text or ""
    for kw in keywords.get("required_any", []):
        if kw in combined:
            for ex in keywords.get("exclude", []):
                if ex in combined:
                    return False
            return True
    return False


def is_duplicate(title: str, existing_titles: list[str]) -> bool:
    for t in existing_titles:
        ratio = SequenceMatcher(None, title, t).ratio()
        if ratio > SIMILARITY_THRESHOLD:
            return True
    return False


def fetch_rss(source: dict, keywords: dict) -> list[dict]:
    articles = []
    try:
        feed = feedparser.parse(source["url"], request_headers=HEADERS)
        for entry in feed.entries:
            title = entry.get("title", "")
            link = entry.get("link", "")
            summary = entry.get("summary", "")
            text = f"{title} {summary}"

            if not matches_keywords(text, keywords):
                continue

            published = entry.get("published_parsed") or entry.get("updated_parsed")
            if published:
                pub_dt = datetime(*published[:6], tzinfo=timezone.utc).astimezone(JST)
                pub_str = pub_dt.isoformat()
            else:
                pub_str = now_jst().isoformat()

            thumbnail = ""
            if hasattr(entry, "media_thumbnail"):
                thumbnail = entry.media_thumbnail[0].get("url", "")
            elif hasattr(entry, "enclosures") and entry.enclosures:
                enc = entry.enclosures[0]
                if enc.get("type", "").startswith("image"):
                    thumbnail = enc.get("href", "")

            articles.append({
                "title": title,
                "url": link,
                "canonical_url": normalize_url(link),
                "source_name": source["name"],
                "source_reliability": source["reliability"],
                "published_at": pub_str,
                "thumbnail_url": thumbnail,
                "raw_summary": re.sub(r"<[^>]+>", "", summary)[:500],
            })
    except Exception as e:
        log.warning(f"RSS fetch failed [{source['name']}]: {e}")
    return articles


def fetch_scrape(source: dict, keywords: dict) -> list[dict]:
    articles = []
    try:
        resp = requests.get(source["url"], headers=HEADERS, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")

        for a in soup.find_all("a", href=True):
            title = a.get_text(strip=True)
            href = a["href"]
            if not href.startswith("http"):
                from urllib.parse import urljoin
                href = urljoin(source["url"], href)

            if len(title) < 10:
                continue
            if not matches_keywords(title, keywords):
                continue

            articles.append({
                "title": title,
                "url": href,
                "canonical_url": normalize_url(href),
                "source_name": source["name"],
                "source_reliability": source["reliability"],
                "published_at": now_jst().isoformat(),
                "thumbnail_url": "",
                "raw_summary": "",
            })
            if len(articles) >= 5:
                break
        time.sleep(2)
    except Exception as e:
        log.warning(f"Scrape failed [{source['name']}]: {e}")
    return articles


def fetch_og_image(url: str) -> str:
    try:
        res = requests.get(url, timeout=3, headers=HEADERS, allow_redirects=True)
        soup = BeautifulSoup(res.text, 'lxml')
        og = soup.find('meta', property='og:image')
        if og and og.get('content'):
            return og['content']
    except Exception:
        pass
    return ""


def analyze_with_gemini(model, article: dict) -> dict:
    prompt = f"""あなたは廿日市市商工会議所の職員向けニュースアナリストです。
以下の記事を分析し、必ずJSON形式のみで回答してください。

タイトル: {article['title']}
情報源: {article['source_name']}
本文・要約: {article.get('raw_summary', '')[:1500]}

情報源の信用度: {article['source_reliability']}
※信用度「高」=公的機関・ニュースメディア・企業公式・プレスリリース系
※信用度「低」=SNS・ブログ・口コミ・地図系サービス等

重要度スコアは以下の重みで算出してください:
- 業務影響度（補助金/出店/閉店/雇用/行政施策）: 30%
- 企業関連度（市内企業・団体・店舗への直接影響）: 25%
- 地域関連度（廿日市市・宮島・大野など地域への関係）: 20%
- 緊急性（即時対応・期限が近い事項か）: 15%
- 信頼度（信用度「高」は加点、「低」は減点）: 10%

信用度「低」の情報源の場合、importance_scoreを最大20点減点してください。

以下のJSON形式のみで回答してください（説明文不要）:
{{
  "summary_short": "1〜2文の短い要約（スマホカード向け）",
  "summary_detail": "3〜5文の詳細要約（業務視点で）",
  "importance_score": 0から100の整数,
  "importance_level": "高または中または低",
  "importance_reason": "重要と判断した理由（1文・30字以内）",
  "related_areas": ["関係する地域名のリスト"],
  "related_entities": ["関係する企業・団体・店舗名のリスト"],
  "business_checkpoints": "業務上の確認ポイント（1文）"
}}"""

    for attempt in range(3):
        try:
            response = model.generate_content(prompt)
            text = response.text.strip()
            text = re.sub(r"^```json\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
            return json.loads(text)
        except Exception as e:
            log.warning(f"Gemini attempt {attempt+1} failed: {e}")
            time.sleep(2 ** attempt)

    return {
        "summary_short": article.get("raw_summary", "")[:100] or article["title"],
        "summary_detail": article.get("raw_summary", "")[:300] or article["title"],
        "importance_score": 30,
        "importance_level": "低",
        "importance_reason": "",
        "related_areas": [],
        "related_entities": [],
        "business_checkpoints": "元記事を直接確認してください",
    }


def main():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        log.error("GEMINI_API_KEY が設定されていません")
        raise SystemExit(1)

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-1.5-flash")

    keywords = load_json(SCRIPT_DIR / "keywords.json", {"required_any": [], "exclude": []})
    sources_config = load_json(SCRIPT_DIR / "sources.json", {"rss_feeds": [], "scrape_sites": []})
    processed_ids: set = set(load_json(PROCESSED_IDS_PATH, []))

    existing_data = load_json(ARTICLES_PATH, {"articles": []})
    existing_articles: list = existing_data.get("articles", [])

    cutoff = now_jst() - timedelta(days=ARTICLES_KEEP_DAYS)
    existing_articles = [
        a for a in existing_articles
        if datetime.fromisoformat(a["published_at"]) >= cutoff
    ]
    existing_titles = [a["title"] for a in existing_articles]
    existing_ids = {a["id"] for a in existing_articles}

    candidates = []

    for source in sources_config.get("rss_feeds", []):
        if not source.get("enabled"):
            continue
        log.info(f"RSS取得: {source['name']}")
        arts = fetch_rss(source, keywords)
        candidates.extend(arts)
        time.sleep(1)

    for source in sources_config.get("scrape_sites", []):
        if not source.get("enabled"):
            continue
        log.info(f"スクレイピング: {source['name']}")
        arts = fetch_scrape(source, keywords)
        candidates.extend(arts)

    new_articles = []
    for art in candidates:
        art_id = make_id(art["canonical_url"])
        if art_id in existing_ids or art_id in processed_ids:
            continue
        if is_duplicate(art["title"], existing_titles):
            continue
        art["id"] = art_id
        new_articles.append(art)
        existing_titles.append(art["title"])
        processed_ids.add(art_id)

    log.info(f"新規候補: {len(new_articles)}件")
    new_articles = new_articles[:MAX_ARTICLES_PER_RUN]

    # サムネイルがない記事はOG画像を並列取得
    no_thumb = [a for a in new_articles if not a.get("thumbnail_url")]
    if no_thumb:
        log.info(f"OG画像取得: {len(no_thumb)}件")
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = {executor.submit(fetch_og_image, a["url"]): a for a in no_thumb}
            for future in as_completed(futures):
                article = futures[future]
                try:
                    img = future.result()
                    if img:
                        article["thumbnail_url"] = img
                except Exception:
                    pass

    analyzed = []
    for i, art in enumerate(new_articles):
        log.info(f"Gemini分析 [{i+1}/{len(new_articles)}]: {art['title'][:40]}")
        result = analyze_with_gemini(model, art)
        art.update(result)
        art["fetched_at"] = now_jst().isoformat()
        analyzed.append(art)
        time.sleep(0.5)

    all_articles = existing_articles + analyzed
    all_articles.sort(key=lambda a: a.get("importance_score", 0), reverse=True)

    output = {
        "updated_at": now_jst().isoformat(),
        "total": len(all_articles),
        "articles": all_articles,
    }

    if analyzed or existing_articles:
        save_json_atomic(ARTICLES_PATH, output)
        log.info(f"articles.json 更新: 合計{len(all_articles)}件（新規{len(analyzed)}件）")
    else:
        log.warning("記事が0件のため articles.json は更新しません")

    save_json_atomic(PROCESSED_IDS_PATH, list(processed_ids)[-5000:])
    log.info("完了")


if __name__ == "__main__":
    main()
