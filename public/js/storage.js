/**
 * localStorage 抽象化レイヤー
 */

const KEYS = {
  USERS: 'hn_users',
  CURRENT_USER: 'hn_current_user',
  SAVED_PREFIX: 'hn_saved_',
};

const MAX_SAVED = 100;

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ===== Users =====

function getUsers() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.USERS) || '[]');
  } catch {
    return [];
  }
}

function saveUsers(users) {
  localStorage.setItem(KEYS.USERS, JSON.stringify(users));
}

function createUser(name) {
  const users = getUsers();
  const user = { id: generateId(), name: name.trim(), createdAt: new Date().toISOString() };
  users.push(user);
  saveUsers(users);
  return user;
}

function deleteUser(userId) {
  const users = getUsers().filter(u => u.id !== userId);
  saveUsers(users);
  localStorage.removeItem(KEYS.SAVED_PREFIX + userId);
  if (getCurrentUserId() === userId) {
    localStorage.removeItem(KEYS.CURRENT_USER);
  }
}

// ===== Current User =====

function getCurrentUserId() {
  return localStorage.getItem(KEYS.CURRENT_USER) || null;
}

function setCurrentUser(userId) {
  localStorage.setItem(KEYS.CURRENT_USER, userId);
  const users = getUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx !== -1) {
    users[idx].lastSeen = new Date().toISOString();
    saveUsers(users);
  }
}

function getCurrentUser() {
  const id = getCurrentUserId();
  if (!id) return null;
  return getUsers().find(u => u.id === id) || null;
}

// ===== Saved Articles =====

function getSavedArticles(userId) {
  try {
    return JSON.parse(localStorage.getItem(KEYS.SAVED_PREFIX + userId) || '[]');
  } catch {
    return [];
  }
}

function isArticleSaved(userId, articleId) {
  return getSavedArticles(userId).some(a => a.articleId === articleId);
}

function saveArticle(userId, article) {
  const saved = getSavedArticles(userId);
  if (saved.some(a => a.articleId === article.id)) return false;

  const entry = {
    articleId: article.id,
    savedAt: new Date().toISOString(),
    articleSnapshot: {
      id: article.id,
      title: article.title,
      url: article.url,
      source_name: article.source_name,
      published_at: article.published_at,
      summary_short: article.summary_short,
      importance_level: article.importance_level,
      importance_score: article.importance_score,
      importance_reason: article.importance_reason,
      category: article.category,
      thumbnail_url: article.thumbnail_url,
    }
  };

  saved.unshift(entry);

  if (saved.length > MAX_SAVED) {
    saved.splice(MAX_SAVED);
  }

  localStorage.setItem(KEYS.SAVED_PREFIX + userId, JSON.stringify(saved));
  return true;
}

function unsaveArticle(userId, articleId) {
  const saved = getSavedArticles(userId).filter(a => a.articleId !== articleId);
  localStorage.setItem(KEYS.SAVED_PREFIX + userId, JSON.stringify(saved));
}

export {
  getUsers, createUser, deleteUser,
  getCurrentUserId, setCurrentUser, getCurrentUser,
  getSavedArticles, isArticleSaved, saveArticle, unsaveArticle,
};
