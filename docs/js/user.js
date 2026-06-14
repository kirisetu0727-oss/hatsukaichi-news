/**
 * ユーザー選択・管理ロジック
 */
import { ICONS, showModal, showToast } from './app.js';
import {
  getUsers, createUser, deleteUser,
  setCurrentUser, getCurrentUserId
} from './storage.js';

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatLastSeen(isoString) {
  if (!isoString) return '初めてのログイン';
  const d = new Date(isoString);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return '最終: 今日';
  const diff = Math.floor((today - d) / 86400000);
  return `最終: ${diff}日前`;
}

function getAvatarColor(name) {
  const colors = ['#C0392B','#1A6B8A','#27AE60','#8E44AD','#E67E22','#2980B9','#C0392B'];
  let hash = 0;
  for (const c of name) hash = c.charCodeAt(0) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export function renderUserScreen() {
  const container = document.getElementById('user-screen');
  if (!container) return;

  const users = getUsers();

  container.innerHTML = `
    <div class="user-screen-logo">
      <div class="user-screen-icon">
        ${ICONS.newspaper}
      </div>
      <div class="user-screen-title">廿日市市ニュース</div>
    </div>

    <div class="user-grid" id="user-grid">
      ${users.map(u => `
        <div class="user-card" data-user-id="${u.id}" role="button" tabindex="0">
          <div class="user-avatar" style="background:${getAvatarColor(u.name)}">${[...u.name][0]}</div>
          <div class="user-name">${escHtml(u.name)}</div>
          <div class="user-last-seen">${formatLastSeen(u.lastSeen)}</div>
          <button class="user-delete-btn" data-delete-id="${u.id}">削除</button>
        </div>`).join('')}
    </div>

    <button class="add-user-btn" id="add-user-btn">
      ${ICONS.plus} 新しいユーザーを追加
    </button>`;

  container.querySelectorAll('.user-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.user-delete-btn')) return;
      selectUser(card.dataset.userId);
    });
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectUser(card.dataset.userId);
      }
    });
  });

  container.querySelectorAll('.user-delete-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const userId = btn.dataset.deleteId;
      const user = getUsers().find(u => u.id === userId);
      showModal({
        title: 'ユーザーを削除',
        desc: `「${escHtml(user?.name || '')}」と保存済み記事は削除され、元に戻せません。削除しますか？`,
        confirmLabel: '削除する',
        confirmClass: 'danger',
        center: true,
        onConfirm: () => {
          deleteUser(userId);
          renderUserScreen();
          showToast('ユーザーを削除しました');
        }
      });
    });
  });

  document.getElementById('add-user-btn')?.addEventListener('click', () => {
    showModal({
      title: '新しいユーザーを追加',
      input: { placeholder: '名前（例：山田太郎）', maxlength: 20 },
      confirmLabel: '追加する',
      onConfirm: name => {
        if (!name) return;
        const user = createUser(name);
        selectUser(user.id);
      }
    });
  });

  if (users.length === 0) {
    showModal({
      title: 'ようこそ！',
      desc: 'まずあなたのお名前を入力してください。',
      input: { placeholder: '名前（例：山田太郎）', maxlength: 20 },
      confirmLabel: 'はじめる',
      center: true,
      onConfirm: name => {
        if (!name) return;
        const user = createUser(name);
        selectUser(user.id);
      }
    });
  }
}

function selectUser(userId) {
  setCurrentUser(userId);
  document.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'news' } }));
}
