/**
 * 管理画面ロジック
 */
import { ICONS, showToast } from './app.js';

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const SOURCES_URL = 'data/sources.json';
const KEYWORDS_URL = 'data/keywords.json';

export async function initAdminPage() {
  const container = document.getElementById('admin-content');
  if (!container) return;

  container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--color-text-muted)">読み込み中…</div>`;

  try {
    const [srcRes, kwRes] = await Promise.all([
      fetch(SOURCES_URL + '?t=' + Date.now()),
      fetch(KEYWORDS_URL + '?t=' + Date.now()),
    ]);
    const sources = await srcRes.json();
    const keywords = await kwRes.json();
    renderAdmin(container, sources, keywords);
  } catch {
    container.innerHTML = `<div style="padding:24px;color:var(--color-text-secondary)">
      設定ファイルを読み込めませんでした。<br>
      <small style="color:var(--color-text-muted)">sources.json / keywords.json はスクリプト実行後に生成されます</small>
    </div>`;
  }
}

function renderAdmin(container, sources, keywords) {
  const rssFeeds = sources.rss_feeds || [];
  const scrapeSites = sources.scrape_sites || [];
  const requiredAny = keywords.required_any || [];

  container.innerHTML = `
    <!-- 手動更新 -->
    <div class="admin-section">
      <div class="admin-section-title">手動更新</div>
      <div style="background:var(--color-surface);border-radius:var(--radius-md);padding:14px;box-shadow:var(--shadow-card)">
        <p style="font-size:var(--text-sm);color:var(--color-text-secondary);margin-bottom:12px">
          GitHub Actionsを手動でトリガーしてニュースを今すぐ更新します。<br>
          <small style="color:var(--color-text-muted)">※ GitHubのPersonal Access Tokenが必要です</small>
        </p>
        <button class="admin-action-btn" id="manual-update-btn">
          ${ICONS.refresh} 今すぐ更新する
        </button>
      </div>
    </div>

    <!-- RSS収集ソース -->
    <div class="admin-section">
      <div class="admin-section-title">RSS収集ソース（${rssFeeds.length}件）</div>
      ${rssFeeds.map((s, i) => `
      <div class="source-item">
        <div class="source-info">
          <div class="source-name">${escHtml(s.name)}</div>
          <div class="source-url">${escHtml(s.url)}</div>
          <small style="font-size:10px;color:var(--color-text-muted)">信頼度：${escHtml(s.reliability)}</small>
        </div>
        <label class="toggle" aria-label="${escHtml(s.name)} 有効/無効">
          <input type="checkbox" ${s.enabled ? 'checked' : ''} data-type="rss" data-index="${i}">
          <span class="toggle-slider"></span>
        </label>
      </div>`).join('')}
    </div>

    <!-- スクレイピングサイト -->
    <div class="admin-section">
      <div class="admin-section-title">公式サイト（${scrapeSites.length}件）</div>
      ${scrapeSites.map((s, i) => `
      <div class="source-item">
        <div class="source-info">
          <div class="source-name">${escHtml(s.name)}</div>
          <div class="source-url">${escHtml(s.url)}</div>
          <small style="font-size:10px;color:var(--color-text-muted)">信頼度：${escHtml(s.reliability)}</small>
        </div>
        <label class="toggle" aria-label="${escHtml(s.name)} 有効/無効">
          <input type="checkbox" ${s.enabled ? 'checked' : ''} data-type="scrape" data-index="${i}">
          <span class="toggle-slider"></span>
        </label>
      </div>`).join('')}
    </div>

    <!-- キーワード -->
    <div class="admin-section">
      <div class="admin-section-title">収集キーワード（${requiredAny.length}件）</div>
      <div class="keyword-tags" id="keyword-tags">
        ${requiredAny.map(kw => `
        <span class="keyword-tag">
          ${escHtml(kw)}
          <button class="keyword-tag-remove" data-kw="${escHtml(kw)}" aria-label="${escHtml(kw)} を削除">
            ${ICONS.x}
          </button>
        </span>`).join('')}
      </div>
      <p style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:4px;padding:0 12px">
        ※ キーワードの追加・削除はsources.json/keywords.jsonを直接編集してください
      </p>
    </div>

    <!-- 最終更新情報 -->
    <div class="admin-section" style="margin-bottom:32px">
      <div class="admin-section-title">データ情報</div>
      <div style="background:var(--color-surface);border-radius:var(--radius-md);padding:14px;box-shadow:var(--shadow-card);font-size:var(--text-sm);color:var(--color-text-secondary);line-height:2">
        <div>📁 データファイル: <code style="font-size:12px">data/articles.json</code></div>
        <div>🕐 自動更新: 毎日 AM6:00 (JST)</div>
        <div>🤖 要約AI: Google Gemini 1.5 Flash（無料枠）</div>
        <div>📦 保存上限: 最新30日分</div>
      </div>
    </div>`;

  document.getElementById('manual-update-btn')?.addEventListener('click', () => {
    showToast('手動更新はGitHub ActionsのWorkflow dispatchから実行してください');
  });
}
