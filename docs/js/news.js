/**
 * ニュース一覧ロジック
 */
import {
  formatRelativeTime, formatDate, getImportanceClass,
  ICONS, showToast, renderSkeletons, renderEmpty, categoryEmoji
} from './app.js';
import { getCurrentUserId, isArticleSaved, saveArticle, unsaveArticle } from './storage.js';

let allArticles = [];
let filteredArticles = [];
let currentCategory = 'all';
let currentSort = 'importance';
let currentDateRange = -1; // -1=全期間, 0=今日, 1=昨日, 7=1週間, 30=1ヶ月

const DATA_URL = 'data/articles.json';

// ===== Fetch =====

export async function loadArticles() {
  const list = document.getElementById('article-list');
  renderSkeletons(list, 4);

  try {
    const res = await fetch(DATA_URL + '?t=' + Date.now());
    if (!res.ok) throw new Error('fetch error');
    const data = await res.json();
    allArticles = data.articles || [];

    const metaEl = document.getElementById('header-meta');
    if (metaEl) {
      const updatedAt = data.updated_at ? formatDate(data.updated_at) : '不明';
      metaEl.textContent = `更新: ${updatedAt}  全${allArticles.length}件`;
    }

    applyFilters();
  } catch (e) {
    renderEmpty(list, {
      title: 'ニュースを読み込めませんでした',
      message: 'ネットワーク接続を確認してください',
      retryFn: loadArticles,
    });
  }
}

// ===== Filter & Sort =====

let currentSearch = '';

export function setSearchQuery(q) { currentSearch = q; }

export function applyFilters(searchQuery = '') {
  currentSearch = searchQuery;
  let result = allArticles;

  if (currentCategory !== 'all') {
    result = result.filter(a => a.category === currentCategory);
  }

  if (currentDateRange >= 0) {
    const now = new Date();
    if (currentDateRange === 0) {
      // 今日
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      result = result.filter(a => new Date(a.published_at || 0) >= todayStart);
    } else if (currentDateRange === 1) {
      // 昨日
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterdayStart = new Date(todayStart - 86400000);
      result = result.filter(a => {
        const d = new Date(a.published_at || 0);
        return d >= yesterdayStart && d < todayStart;
      });
    } else {
      // N日間
      const cutoff = new Date(now - currentDateRange * 86400000);
      result = result.filter(a => new Date(a.published_at || 0) >= cutoff);
    }
  }

  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    result = result.filter(a =>
      a.title?.toLowerCase().includes(q) ||
      a.summary_short?.toLowerCase().includes(q) ||
      a.summary_detail?.toLowerCase().includes(q) ||
      a.source_name?.toLowerCase().includes(q) ||
      (a.related_areas || []).join('').toLowerCase().includes(q) ||
      (a.related_entities || []).join('').toLowerCase().includes(q)
    );
  }

  if (currentSort === 'importance') {
    result = [...result].sort((a, b) => {
      const scoreDiff = (b.importance_score || 0) - (a.importance_score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.published_at || 0) - new Date(a.published_at || 0);
    });
  } else {
    result = [...result].sort((a, b) =>
      new Date(b.published_at || 0) - new Date(a.published_at || 0)
    );
  }

  filteredArticles = result;
  renderArticleList();
}

function renderArticleList() {
  const list = document.getElementById('article-list');
  const countEl = document.getElementById('article-count');
  if (countEl) countEl.textContent = `${filteredArticles.length}件`;

  if (filteredArticles.length === 0) {
    renderEmpty(list, {
      title: '記事が見つかりません',
      message: '検索条件を変えてみてください',
    });
    return;
  }

  list.innerHTML = filteredArticles.map(article => renderCard(article)).join('');
  attachCardEvents(list);
}

// ===== Card =====

function renderCard(article) {
  const cls = getImportanceClass(article.importance_level);
  const userId = getCurrentUserId();
  const saved = userId ? isArticleSaved(userId, article.id) : false;
  const isHigh = article.importance_score >= 60;

  if (isHigh) {
    return `
    <article class="card" data-id="${article.id}" role="article" tabindex="0">
      ${renderThumbnail(article, 'card-thumbnail')}
      <div class="card-body">
        <div class="card-importance">
          <span class="badge badge-${cls}">
            <span class="badge-dot"></span>
            重要度：${article.importance_level || '低'}
          </span>
          ${article.category ? `<span class="category-chip">${categoryEmoji(article.category)} ${article.category}</span>` : ''}
        </div>
        <h2 class="card-title">${escHtml(article.title || '')}</h2>
        <p class="card-summary">${escHtml(article.summary_short || '')}</p>
        <div class="card-meta">
          <span>${escHtml(article.source_name || '')}</span>
          <span class="card-meta-dot">·</span>
          <span>${formatRelativeTime(article.published_at)}</span>
        </div>
        ${article.importance_reason ? `<div class="card-reason">「${escHtml(article.importance_reason)}」</div>` : ''}
        <div class="card-footer">
          <button class="save-btn${saved ? ' saved' : ''}" data-article-id="${article.id}" aria-label="${saved ? '保存解除' : '保存'}">
            ${saved ? ICONS.bookmarkFill : ICONS.bookmark}
            <span>${saved ? '保存済み' : '保存'}</span>
          </button>
        </div>
      </div>
    </article>`;
  } else {
    return `
    <article class="card card-compact" data-id="${article.id}" role="article" tabindex="0">
      <div class="card-compact-content">
        <div class="card-compact-title">${escHtml(article.title || '')}</div>
        <div class="card-compact-meta">
          <span class="badge badge-${cls}" style="padding:1px 7px;font-size:10px">
            <span class="badge-dot"></span>${article.importance_level || '低'}
          </span>
          <span class="card-meta-dot">·</span>
          <span>${escHtml(article.source_name || '')}</span>
          <span class="card-meta-dot">·</span>
          <span>${formatRelativeTime(article.published_at)}</span>
        </div>
      </div>
      <button class="save-btn${saved ? ' saved' : ''}" data-article-id="${article.id}" aria-label="${saved ? '保存解除' : '保存'}"
        style="padding:6px;border-radius:50%;min-width:40px;justify-content:center">
        ${saved ? ICONS.bookmarkFill : ICONS.bookmark}
      </button>
    </article>`;
  }
}

function renderThumbnail(article, imgClass) {
  if (article.thumbnail_url) {
    return `<img class="${imgClass}" src="${escAttr(article.thumbnail_url)}" alt="" loading="lazy"
      onerror="this.style.display='none'">`;
  }
  return '';
}

function attachCardEvents(container) {
  container.querySelectorAll('[data-id]').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.save-btn')) return;
      const id = card.dataset.id;
      sessionStorage.setItem('viewing_article', id);
      document.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'detail', id } }));
    });
  });

  container.querySelectorAll('.save-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const articleId = btn.dataset.articleId;
      const userId = getCurrentUserId();
      if (!userId) { showToast('ユーザーを選択してください'); return; }
      const article = allArticles.find(a => a.id === articleId);
      if (!article) return;

      const alreadySaved = isArticleSaved(userId, articleId);
      if (alreadySaved) {
        unsaveArticle(userId, articleId);
        btn.classList.remove('saved', 'pulse');
        btn.innerHTML = ICONS.bookmark + (btn.querySelector('span') ? '<span>保存</span>' : '');
        showToast('保存を解除しました');
      } else {
        saveArticle(userId, article);
        btn.classList.add('saved');
        void btn.offsetWidth;
        btn.classList.add('pulse');
        btn.innerHTML = ICONS.bookmarkFill + (btn.querySelector('span') ? '<span>保存済み</span>' : '');
        showToast('記事を保存しました');
      }
    });
  });
}

// ===== Category chips =====

export function initFilters() {
  const categories = ['すべて', '補助金', '企業', '店舗', '雇用', '観光', 'イベント', '行政', 'その他'];
  const bar = document.getElementById('category-chips');
  if (!bar) return;

  bar.innerHTML = categories.map((cat, i) => {
    const val = i === 0 ? 'all' : cat;
    return `<button class="chip${i === 0 ? ' active' : ''}" data-cat="${val}">${cat}</button>`;
  }).join('');

  bar.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    bar.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentCategory = chip.dataset.cat;
    applyFilters();
  });

  document.getElementById('sort-importance')?.addEventListener('click', () => {
    currentSort = 'importance';
    document.getElementById('sort-importance').classList.add('active');
    document.getElementById('sort-newest').classList.remove('active');
    applyFilters();
  });

  document.getElementById('sort-newest')?.addEventListener('click', () => {
    currentSort = 'newest';
    document.getElementById('sort-newest').classList.add('active');
    document.getElementById('sort-importance').classList.remove('active');
    applyFilters();
  });

  const dateBar = document.getElementById('date-filter-chips');
  if (dateBar) {
    const dateOptions = [
      { label: '全期間', value: -1 },
      { label: '今日', value: 0 },
      { label: '昨日', value: 1 },
      { label: '1週間', value: 7 },
      { label: '1ヶ月', value: 30 },
    ];
    dateBar.innerHTML = dateOptions.map((opt, i) =>
      `<button class="date-chip${i === 0 ? ' active' : ''}" data-range="${opt.value}">${opt.label}</button>`
    ).join('');

    dateBar.addEventListener('click', e => {
      const chip = e.target.closest('.date-chip');
      if (!chip) return;
      dateBar.querySelectorAll('.date-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentDateRange = Number(chip.dataset.range);
      applyFilters();
    });
  }
}

// ===== Escape helpers =====

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escAttr(str) { return escHtml(str); }

export { allArticles };
