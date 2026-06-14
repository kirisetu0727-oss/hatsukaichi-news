/**
 * アプリ エントリーポイント
 */
import { renderUserScreen } from './user.js';
import { loadArticles, initFilters, applyFilters } from './news.js';
import { initSavedPage } from './saved.js';
import { initAdminPage } from './admin.js';
import { getCurrentUserId, getCurrentUser } from './storage.js';
import { showToast, ICONS } from './app.js';

// ===== State =====
let currentPage = 'news';

// ===== Init =====

function init() {
  const userId = getCurrentUserId();
  if (!userId) {
    showUserScreen();
  } else {
    showMainApp(userId);
  }

  // オフライン検知
  window.addEventListener('offline', () => {
    showToast(`${ICONS.wifi_off} オフラインです。前回の記事を表示しています`, 'offline', 5000);
  });

  // Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('../sw.js').catch(() => {});
  }
}

// ===== User Screen =====

function showUserScreen() {
  document.getElementById('user-screen').style.display = '';
  document.getElementById('main-app').style.display = 'none';
  renderUserScreen();
}

function showMainApp(userId) {
  document.getElementById('user-screen').style.display = 'none';
  document.getElementById('main-app').style.display = '';

  updateHeaderUser();
  initFilters();
  loadArticles();
  setupNav();
  setupSearch();
}

// ===== Navigation =====

function setupNav() {
  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });
}

function navigateTo(page) {
  if (page === currentPage && page !== 'detail') return;

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));

  const pageEl = document.getElementById(`${page}-page`);
  if (pageEl) pageEl.classList.add('active');

  const navBtn = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navBtn) navBtn.classList.add('active');

  currentPage = page;

  if (page === 'saved') initSavedPage();
  if (page === 'admin') initAdminPage();

  window.scrollTo(0, 0);
}

// ===== Custom navigate event (from cards/detail) =====

document.addEventListener('navigate', async e => {
  const { page, id } = e.detail;
  if (page === 'detail' && id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    const detailPage = document.getElementById('detail-page');
    if (detailPage) detailPage.classList.add('active');
    currentPage = 'detail';
    const { renderDetail } = await import('./article.js');
    renderDetail(id);
  } else if (page === 'news') {
    const mainApp = document.getElementById('main-app');
    if (!mainApp || mainApp.style.display === 'none') {
      showMainApp(getCurrentUserId());
    } else {
      navigateTo('news');
    }
  }
});

// ===== Header user =====

function updateHeaderUser() {
  const user = getCurrentUser();
  const el = document.getElementById('header-user-name');
  if (el && user) el.textContent = user.name;
}

document.getElementById('user-switch-btn')?.addEventListener('click', () => {
  showUserScreen();
});

// ===== Search =====

function setupSearch() {
  const overlay = document.getElementById('search-overlay');
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');

  document.getElementById('search-btn')?.addEventListener('click', () => {
    overlay.style.display = 'flex';
    input?.focus();
  });

  document.getElementById('search-cancel')?.addEventListener('click', () => {
    overlay.style.display = 'none';
    if (input) input.value = '';
  });

  let debounceTimer;
  input?.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const q = input.value.trim();
      if (!q) {
        results.innerHTML = `<div class="empty-state" style="padding-top:40px"><p style="color:var(--color-text-muted)">キーワードを入力してください</p></div>`;
        return;
      }
      applyFilters(q);
      const articleList = document.getElementById('article-list');
      results.innerHTML = articleList?.innerHTML || '';

      results.querySelectorAll('[data-id]').forEach(card => {
        card.addEventListener('click', e => {
          if (e.target.closest('.save-btn')) return;
          overlay.style.display = 'none';
          navigateTo('detail');
          document.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'detail', id: card.dataset.id } }));
        });
      });
    }, 200);
  });
}

// ===== Start =====
init();
