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

  const currentHash = window.location.hash || '#home';
  const currentPage = currentHash.replace('#', '').split('/')[0];

  let linksHtml = `
    <a class="nav-editorial-link ${currentPage === 'home' || !currentPage ? 'active' : ''}" href="#home">Articles</a>
  `;

  if (auth) {
    linksHtml += `
      <a class="nav-editorial-link ${currentPage === 'my-blogs' ? 'active' : ''}" href="#my-blogs">My Writings</a>
    `;
    if (auth.role === 'admin') {
      linksHtml += `
        <a class="nav-editorial-link text-danger ${currentPage === 'admin' ? 'active' : ''}" href="#admin">Students Ledger</a>
      `;
    }
  }
  navLinks.innerHTML = linksHtml;

  if (auth) {
    const roleClass = auth.role === 'admin' ? 'admin' : 'student';
    navAuth.innerHTML = `
      <div class="d-flex align-items-center gap-2">
        <span class="role-badge ${roleClass}">${auth.role}</span>
        <span class="font-mono small fw-semibold text-dark">${auth.username}</span>
        <button class="btn btn-modern-outline btn-modern-sm" id="btn-logout" title="Đăng xuất">
          Logout
        </button>
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
      <button class="btn btn-modern-primary btn-modern-sm" data-bs-toggle="modal" data-bs-target="#loginModal">
        Sign In
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
  submitBtn.textContent = 'AUTHENTICATING...';

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
    errEl.textContent = err.message || 'Xác thực thất bại. Vui lòng kiểm tra lại MSSV hoặc mật khẩu.';
    errEl.classList.remove('d-none');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'XÁC THỰC & ĐĂNG NHẬP';
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
      alert('Chức năng này yêu cầu quyền Quản trị viên (Admin).');
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
    appEl.innerHTML = `
      <div class="text-center py-5">
        <div class="spinner-border spinner-border-sm text-dark" role="status"></div>
        <div class="mt-2 font-mono small text-muted">LOADING VIEW...</div>
      </div>
    `;
    const mod = await loader();
    appEl.innerHTML = '';
    await mod.render(appEl, param);
  } catch (error) {
    console.error('Routing error:', error);
    appEl.innerHTML = `
      <div class="py-5 text-center">
        <h2 class="h4 font-serif text-danger mb-2">Error Loading View</h2>
        <p class="text-muted font-mono small">${error.message}</p>
        <button class="btn btn-modern-outline btn-modern-sm mt-3" onclick="window.location.hash='#home'">Return to Archive</button>
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
