/**
 * 保存済み記事ロジック
 */
import {
  formatRelativeTime, getImportanceClass,
  ICONS, showToast, categoryEmoji
} from './app.js';
import {
  getUsers, getCurrentUserId, setCurrentUser,
  getSavedArticles, unsaveArticle
} from './storage.js';

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let displayUserId = null;

export function initSavedPage() {
  displayUserId = getCurrentUserId();
  renderSavedPage();
}

function renderSavedPage() {
  const page = document.getElementById('saved-page');
  if (!page) return;

  const users = getUsers();
  const currentId = getCurrentUserId();

  const userOptions = users.map(u =>
    `<option value="${u.id}" ${u.id === displayUserId ? 'selected' : ''}>${escHtml(u.name)}</option>`
  ).join('');

  const saved = displayUserId ? getSavedArticles(displayUserId) : [];
  const userName = users.find(u => u.id === displayUserId)?.name || '未選択';

  page.innerHTML = `
    <div class="saved-header-info">
      <span class="saved-user-label">${escHtml(userName)}さんの保存記事</span>
      ${users.length > 1 ? `
      <select class="saved-user-select" id="saved-user-select">
        ${userOptions}
      </select>` : ''}
    </div>
    <div class="article-list" id="saved-list"></div>`;

  document.getElementById('saved-user-select')?.addEventListener('change', e => {
    displayUserId = e.target.value;
    renderSavedPage();
  });

  renderSavedList(saved);
}

function renderSavedList(saved) {
  const list = document.getElementById('saved-list');
  if (!list) return;

  if (saved.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        ${ICONS.saved}
        <h3>保存した記事がありません</h3>
        <p>気になる記事の🔖ボタンを押すと<br>ここに保存されます</p>
      </div>`;
    return;
  }

  list.innerHTML = saved.map(entry => {
    const a = entry.articleSnapshot || {};
    const cls = getImportanceClass(a.importance_level);
    return `
    <article class="card card-compact" data-url="${escHtml(a.url || '#')}" style="cursor:pointer">
      <div class="card-compact-content">
        <div class="card-compact-title">${escHtml(a.title || '')}</div>
        <div class="card-compact-meta">
          <span class="badge badge-${cls}" style="padding:1px 7px;font-size:10px">
            <span class="badge-dot"></span>${a.importance_level || '低'}
          </span>
          <span class="card-meta-dot">·</span>
          <span>${escHtml(a.source_name || '')}</span>
          <span class="card-meta-dot">·</span>
          <span>保存: ${formatRelativeTime(entry.savedAt)}</span>
        </div>
        ${a.summary_short ? `<div style="font-size:12px;color:var(--color-text-muted);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(a.summary_short)}</div>` : ''}
      </div>
      ${displayUserId === getCurrentUserId() ? `
      <button class="save-btn saved" data-article-id="${a.id}" aria-label="保存解除"
        style="padding:6px;border-radius:50%;min-width:40px;justify-content:center">
        ${ICONS.bookmarkFill}
      </button>` : ''}
    </article>`;
  }).join('');

  list.querySelectorAll('.save-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const articleId = btn.dataset.articleId;
      unsaveArticle(displayUserId, articleId);
      showToast('保存を解除しました');
      initSavedPage();
    });
  });

  list.querySelectorAll('[data-url]').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.save-btn')) return;
      const url = card.dataset.url;
      if (url && url !== '#') window.open(url, '_blank', 'noopener,noreferrer');
    });
  });
}
