/**
 * 記事詳細ロジック
 */
import {
  formatDate, formatRelativeTime, getImportanceClassByScore, formatScore,
  ICONS, showToast
} from './app.js';
import { getCurrentUserId, isArticleSaved, saveArticle, unsaveArticle } from './storage.js';
import { allArticles } from './news.js';

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderDetail(articleId) {
  const article = allArticles.find(a => a.id === articleId);
  const container = document.getElementById('detail-page');
  if (!container) return;

  if (!article) {
    container.innerHTML = `<div style="padding:40px 16px;text-align:center;color:var(--color-text-muted)">記事が見つかりませんでした</div>`;
    return;
  }

  const cls = getImportanceClassByScore(article.importance_score);
  const userId = getCurrentUserId();
  const saved = userId ? isArticleSaved(userId, article.id) : false;

  const thumbnail = article.thumbnail_url
    ? `<img class="detail-thumbnail" src="${escHtml(article.thumbnail_url)}" alt="" loading="lazy"
        onerror="this.style.display='none'">`
    : '';

  const areas = (article.related_areas || []).map(a => `<span class="detail-tag" data-filter="${escHtml(a)}">📍 ${escHtml(a)}</span>`).join('');
  const entities = (article.related_entities || []).map(e => `<span class="detail-tag" data-filter="${escHtml(e)}">🏢 ${escHtml(e)}</span>`).join('');

  container.innerHTML = `
    <div class="detail-header">
      <button class="back-btn" id="detail-back">${ICONS.back} 戻る</button>
      <div style="flex:1"></div>
    </div>
    <div class="detail-content">
      ${thumbnail}
      <div class="detail-body">
        <div class="detail-importance">
          <span class="badge badge-${cls}">
            <span class="badge-dot"></span>
            重要度：${formatScore(article.importance_score)}
          </span>
        </div>
        ${article.importance_reason ? `<div class="detail-reason-box">「${escHtml(article.importance_reason)}」</div>` : ''}

        <h1 class="detail-title">${escHtml(article.title || '')}</h1>
        <div class="detail-source-line">
          <span class="source-badge">${escHtml(article.source_name || '')}</span>
          <span>${formatDate(article.published_at)}</span>
          <span style="margin-left:auto">取得: ${formatRelativeTime(article.fetched_at)}</span>
        </div>

        <div class="detail-section">
          <div class="detail-section-label">かんたん要約</div>
          <p>${escHtml(article.summary_short || '')}</p>
        </div>

        ${article.summary_detail ? `
        <div class="detail-section">
          <div class="detail-section-label">詳細要約</div>
          <p>${escHtml(article.summary_detail)}</p>
        </div>` : ''}

        ${(areas || entities) ? `
        <div class="detail-section">
          <div class="detail-section-label">関連情報</div>
          <div class="detail-tags">
            ${areas}
            ${entities}
          </div>
        </div>` : ''}


        <a class="detail-link-btn" href="${escHtml(article.url || '#')}" target="_blank" rel="noopener noreferrer">
          元記事を読む ${ICONS.external}
        </a>
      </div>
    </div>
    <div class="detail-save-bar">
      <button class="detail-save-btn${saved ? ' saved' : ''}" id="detail-save-btn">
        ${saved ? ICONS.bookmarkFill : ICONS.bookmark}
        <span>${saved ? '保存済み' : '保存する'}</span>
      </button>
    </div>`;

  document.getElementById('detail-back')?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'news' } }));
  });

  container.querySelectorAll('.detail-tag[data-filter]').forEach(tag => {
    tag.addEventListener('click', () => {
      const keyword = tag.dataset.filter;
      document.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'news', filterTag: keyword } }));
    });
  });

  const saveBtn = document.getElementById('detail-save-btn');
  saveBtn?.addEventListener('click', () => {
    const uid = getCurrentUserId();
    if (!uid) { showToast('ユーザーを選択してください'); return; }
    const alreadySaved = isArticleSaved(uid, article.id);
    if (alreadySaved) {
      unsaveArticle(uid, article.id);
      saveBtn.classList.remove('saved');
      saveBtn.innerHTML = `${ICONS.bookmark}<span>保存する</span>`;
      showToast('保存を解除しました');
    } else {
      saveArticle(uid, article);
      saveBtn.classList.add('saved');
      saveBtn.innerHTML = `${ICONS.bookmarkFill}<span>保存済み</span>`;
      showToast('記事を保存しました');
    }
  });
}
