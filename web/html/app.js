import { getAuth, saveAuth, clearAuth, login } from './api.js';

export function navigate(hash) {
  window.location.hash = hash;
}

export { getAuth };

export function renderNav() {
  const auth = getAuth();
  const navLinks = document.getElementById('nav-links');
  const navAuth  = document.getElementById('nav-auth');
  if (!navLinks || !navAuth) return;

  let linksHtml = `<li class="nav-item"><a class="nav-link" href="#home">Trang chủ Blog</a></li>`;
  if (auth) {
    linksHtml += `<li class="nav-item"><a class="nav-link" href="#my-blogs">Blog của tôi</a></li>`;
    if (auth.role === 'admin') {
      linksHtml += `<li class="nav-item"><a class="nav-link text-warning fw-bold" href="#admin">Quản lý Sinh viên</a></li>`;
    }
  }
  navLinks.innerHTML = linksHtml;

  if (auth) {
    const roleBadge = auth.role === 'admin' 
      ? '<span class="badge bg-danger me-2">ADMIN</span>' 
      : '<span class="badge bg-primary me-2">SINH VIÊN</span>';
    navAuth.innerHTML = `
      <div class="d-flex align-items-center">
        ${roleBadge}
        <span class="navbar-text me-3 fw-semibold text-light">${auth.username}</span>
        <button class="btn btn-outline-light btn-sm" id="btn-logout">Đăng xuất</button>
      </div>
    `;
    document.getElementById('btn-logout')?.addEventListener('click', () => {
      clearAuth();
      renderNav();
      navigate('#home');
      route();
    });
  } else {
    navAuth.innerHTML = `
      <button class="btn btn-primary btn-sm px-3" data-bs-toggle="modal" data-bs-target="#loginModal">
        Đăng nhập
      </button>
    `;
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  const submitBtn = e.target.querySelector('button[type="submit"]');

  errEl.classList.add('d-none');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Đang đăng nhập...';

  try {
    const auth = await login(username, password);
    saveAuth(auth);
    const modalEl = document.getElementById('loginModal');
    const modalInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
    modalInstance.hide();
    renderNav();
    document.getElementById('login-form').reset();
    navigate(auth.role === 'admin' ? '#admin' : '#home');
  } catch (err) {
    errEl.textContent = err.message || 'Sai tên đăng nhập hoặc mật khẩu.';
    errEl.classList.remove('d-none');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Đăng nhập';
  }
}

export async function route() {
  const hash = window.location.hash || '#home';
  const appEl = document.getElementById('app');
  if (!appEl) return;

  const [page, param] = hash.replace('#', '').split('/');
  const auth = getAuth();

  const guards = {
    'my-blogs': true,
    'blog-form': true,
    'admin': 'admin'
  };

  if (guards[page]) {
    if (!auth) {
      navigate('#home');
      const loginModal = bootstrap.Modal.getInstance(document.getElementById('loginModal')) || new bootstrap.Modal(document.getElementById('loginModal'));
      loginModal.show();
      return;
    }
    if (guards[page] === 'admin' && auth.role !== 'admin') {
      alert('Bạn không có quyền truy cập trang quản trị!');
      navigate('#home');
      return;
    }
  }

  const modules = {
    'home':      () => import('./pages/home.js'),
    'blog':      () => import('./pages/blog-detail.js'),
    'blog-form': () => import('./pages/blog-form.js'),
    'my-blogs':  () => import('./pages/my-blogs.js'),
    'admin':     () => import('./pages/admin.js'),
  };

  const loader = modules[page] ?? modules['home'];
  try {
    appEl.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div></div>';
    const mod = await loader();
    appEl.innerHTML = '';
    await mod.render(appEl, param);
  } catch (error) {
    console.error('Routing error:', error);
    appEl.innerHTML = `
      <div class="alert alert-danger my-4">
        <h4>Lỗi tải trang</h4>
        <p>${error.message}</p>
        <button class="btn btn-primary" onclick="window.location.hash='#home'">Về trang chủ</button>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderNav();
  document.getElementById('login-form')?.addEventListener('submit', handleLogin);
  window.addEventListener('hashchange', () => {
    renderNav();
    route();
  });
  route();
});
