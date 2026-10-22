const KC_TOKEN_URL = '/auth/realms/master/protocol/openid-connect/token';
const API_BASE     = '/api';

export async function login(username, password) {
  const res = await fetch(KC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'flask-app',
      username: username,
      password: password
    })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error_description || 'Invalid credentials');
  }
  const { access_token } = await res.json();
  const payload = JSON.parse(atob(access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  const roles = payload.realm_access?.roles ?? [];
  const role = roles.includes('admin') ? 'admin' : 'student';
  const usernameClean = (payload.preferred_username || username).toUpperCase();
  return { token: access_token, username: usernameClean, role };
}

export function getAuth() {
  const raw = sessionStorage.getItem('auth');
  return raw ? JSON.parse(raw) : null;
}

export function saveAuth(authObj) {
  sessionStorage.setItem('auth', JSON.stringify(authObj));
}

export function clearAuth() {
  sessionStorage.removeItem('auth');
}

export async function apiFetch(path, options = {}) {
  const auth = getAuth();
  const headers = { 'Content-Type': 'application/json', ...(options.headers ?? {}) };
  if (auth?.token) {
    headers['Authorization'] = `Bearer ${auth.token}`;
  }
  const res = await fetch(API_BASE + path, { ...options, headers });
  if (res.status === 401) {
    clearAuth();
    window.location.hash = '#home';
    const loginModal = bootstrap.Modal.getInstance(document.getElementById('loginModal')) || new bootstrap.Modal(document.getElementById('loginModal'));
    const errEl = document.getElementById('login-error');
    if (errEl) {
      errEl.textContent = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
      errEl.classList.remove('d-none');
    }
    loginModal.show();
  }
  return res;
}

export async function uploadFile(file) {
  const auth = getAuth();
  const fd = new FormData();
  fd.append('file', file);
  const headers = {};
  if (auth?.token) {
    headers['Authorization'] = `Bearer ${auth.token}`;
  }
  const res = await fetch(API_BASE + '/upload', {
    method: 'POST',
    headers,
    body: fd
  });
  return res.json();
}
