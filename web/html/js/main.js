// Client-side interactions for MiniCloud Multi-Page System

const KC_TOKEN_URL = '/auth/realms/master/protocol/openid-connect/token';
const API_BASE = '/api';

function getAuth() {
  const raw = sessionStorage.getItem('auth');
  return raw ? JSON.parse(raw) : null;
}

function saveAuth(auth) {
  sessionStorage.setItem('auth', JSON.stringify(auth));
}

function clearAuth() {
  sessionStorage.removeItem('auth');
}

function initNavHighlight() {
  const currentPath = window.location.pathname;
  const navLinks = document.querySelectorAll('.masthead nav a');

  navLinks.forEach(link => {
    link.classList.remove('active');
    const href = link.getAttribute('href');

    if (currentPath === '/' || currentPath === '/index.html' || currentPath.startsWith('/blog')) {
      if (href === '/' || href === '/index.html') link.classList.add('active');
    } else if (currentPath.includes('students')) {
      if (href.includes('students')) link.classList.add('active');
    } else if (currentPath.includes('tools')) {
      if (href.includes('tools')) link.classList.add('active');
    }
  });
}

function updateNavAuth() {
  const auth = getAuth();
  const navAuth = document.getElementById('nav-auth');
  const addStudentBtn = document.getElementById('btn-add-student-modal');
  const adminCols = document.querySelectorAll('.admin-col');

  if (!navAuth) return;

  if (auth) {
    const roleClass = auth.role === 'admin' ? 'admin' : '';
    const roleText = auth.role === 'admin' ? 'QUẢN TRỊ' : 'SINH VIÊN';
    navAuth.innerHTML = `
      <div class="d-flex align-items-center gap-2">
        <span class="role-badge ${roleClass}">${roleText}</span>
        <span class="font-mono small fw-semibold text-dark">${auth.username}</span>
        <button class="btn btn-modern-outline btn-modern-sm" id="btn-logout">Đăng xuất</button>
      </div>
    `;
    document.getElementById('btn-logout')?.addEventListener('click', () => {
      clearAuth();
      updateNavAuth();
      loadStudents();
    });

    if (auth.role === 'admin') {
      addStudentBtn?.classList.remove('d-none');
      adminCols.forEach(el => el.classList.remove('d-none'));
    } else {
      addStudentBtn?.classList.add('d-none');
      adminCols.forEach(el => el.classList.add('d-none'));
    }
  } else {
    navAuth.innerHTML = `
      <button class="btn btn-modern-primary btn-modern-sm" data-bs-toggle="modal" data-bs-target="#loginModal">
        Đăng nhập
      </button>
    `;
    addStudentBtn?.classList.add('d-none');
    adminCols.forEach(el => el.classList.add('d-none'));
  }
}

async function login(username, password) {
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
    throw new Error(errData.error_description || 'Thông tin đăng nhập không hợp lệ');
  }
  const { access_token } = await res.json();
  const payload = JSON.parse(atob(access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  const roles = payload.realm_access?.roles ?? [];
  const role = roles.includes('admin') ? 'admin' : 'student';
  const usernameClean = (payload.preferred_username || username).toUpperCase();
  return { token: access_token, username: usernameClean, role };
}

async function loadStudents() {
  const tbody = document.getElementById('student-table-body');
  if (!tbody) return;

  const auth = getAuth();
  const headers = {};
  if (auth?.token) {
    headers['Authorization'] = `Bearer ${auth.token}`;
  }

  tbody.innerHTML = `
    <tr>
      <td colspan="6" class="text-center py-4 text-muted font-mono small">
        <span class="spinner-border spinner-border-sm me-2"></span> ĐANG TẢI DỮ LIỆU TỪ CSDL MARIADB...
      </td>
    </tr>
  `;

  try {
    let res = await fetch(`${API_BASE}/students-db`, { headers });
    let students = [];

    if (res.ok) {
      students = await res.json();
    } else {
      const fb = await fetch('/student/');
      if (fb.ok) {
        const raw = await fb.json();
        students = raw.map(s => ({
          id: s.id,
          student_id: `SV00${s.id}`,
          fullname: s.name,
          dob: '2002-01-01',
          major: s.major
        }));
      }
    }

    if (!students || students.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-4 text-muted font-mono small">
            CHƯA CÓ BẢN GHI SINH VIÊN NÀO TRONG MARIADB.
          </td>
        </tr>
      `;
      return;
    }

    const isAdmin = auth?.role === 'admin';
    tbody.innerHTML = students.map((st, idx) => `
      <tr>
        <td class="font-mono text-muted">${String(idx + 1).padStart(2, '0')}</td>
        <td class="font-mono fw-semibold text-dark">${st.student_id}</td>
        <td class="fw-medium">${st.fullname}</td>
        <td class="font-mono text-muted">${st.dob || '—'}</td>
        <td><span class="badge border-hairline text-dark font-sans" style="background: var(--bg-alt);">${st.major}</span></td>
        <td class="text-end admin-col ${isAdmin ? '' : 'd-none'}">
          <button class="btn btn-modern-outline btn-modern-sm text-danger py-1 px-2 btn-delete-st" data-id="${st.id}" title="Xóa sinh viên">
            Xóa
          </button>
        </td>
      </tr>
    `).join('');

    // Attach delete handlers
    document.querySelectorAll('.btn-delete-st').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.getAttribute('data-id');
        if (!confirm(`Bạn có chắc chắn muốn xóa sinh viên ID #${id}?`)) return;
        const delRes = await fetch(`${API_BASE}/students-db/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${auth.token}` }
        });
        if (delRes.ok) {
          loadStudents();
        } else {
          alert('Không thể xóa sinh viên.');
        }
      });
    });

  } catch (err) {
    console.error('Lỗi nạp sinh viên:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-4 text-danger font-mono small">
          KHÔNG THỂ KẾT NỐI ĐẾN MÁY CHỦ CSDL MARIADB.
        </td>
      </tr>
    `;
  }
}

// Interactive Testers for students.html
function initStudentTesters() {
  const out = document.getElementById('api-test-output');
  if (!out) return;

  document.getElementById('btn-test-student-public')?.addEventListener('click', async () => {
    out.textContent = '// Đang gửi GET /student/ ...';
    try {
      const res = await fetch('/student/');
      const data = await res.json();
      out.textContent = `// HTTP ${res.status} OK — /student/\n` + JSON.stringify(data, null, 2);
    } catch (err) {
      out.textContent = `// Lỗi kết nối: ${err.message}`;
    }
  });

  document.getElementById('btn-test-student-db')?.addEventListener('click', async () => {
    out.textContent = '// Đang gửi GET /api/students-db ...';
    try {
      const auth = getAuth();
      const headers = auth?.token ? { 'Authorization': `Bearer ${auth.token}` } : {};
      const res = await fetch(`${API_BASE}/students-db`, { headers });
      const data = await res.json();
      out.textContent = `// HTTP ${res.status} OK — /api/students-db\n` + JSON.stringify(data, null, 2);
    } catch (err) {
      out.textContent = `// Lỗi kết nối: ${err.message}`;
    }
  });
}

// Interactive Diagnostic Tools for tools.html
function initDiagnosticTools() {
  const pingBtn = document.getElementById('btn-ping-backend');
  const pingRes = document.getElementById('ping-backend-res');

  pingBtn?.addEventListener('click', async () => {
    pingRes.textContent = '// Đang gửi ping đến /api/hello...';
    const start = performance.now();
    try {
      const res = await fetch('/api/hello', { cache: 'no-store' });
      const latency = Math.round(performance.now() - start);
      const data = await res.json();
      pingRes.innerHTML = `STATUS: <span class="text-success">${res.status} OK</span> | Latency: <strong>${latency}ms</strong><br>Data: ${JSON.stringify(data)}`;
    } catch (err) {
      pingRes.innerHTML = `<span class="text-danger">Lỗi ping: ${err.message}</span>`;
    }
  });

  const rrBtn = document.getElementById('btn-test-round-robin');
  const rrRes = document.getElementById('rr-test-res');

  rrBtn?.addEventListener('click', async () => {
    rrRes.innerHTML = '// Đang gửi 4 request luân phiên qua API Gateway...<br>';
    const results = [];
    for (let i = 1; i <= 4; i++) {
      try {
        const res = await fetch(`/?_t=${Date.now()}_${i}`, { cache: 'no-store' });
        const servedBy = res.headers.get('X-Served-By') || 'web-node';
        const upstream = res.headers.get('X-Upstream-Addr') || 'round-robin';
        results.push(`Req #${i}: Node [${servedBy}] Upstream: ${upstream}`);
      } catch (e) {
        results.push(`Req #${i}: Lỗi kết nối`);
      }
    }
    rrRes.innerHTML = results.map(r => `<div>${r}</div>`).join('');
  });

  const oidcBtn = document.getElementById('btn-test-oidc-doc');
  const oidcRes = document.getElementById('oidc-test-res');

  oidcBtn?.addEventListener('click', async () => {
    oidcRes.textContent = '// Đang lấy tài liệu OpenID Configuration...';
    try {
      const res = await fetch('/auth/realms/master/.well-known/openid-configuration');
      if (res.ok) {
        const doc = await res.json();
        oidcRes.innerHTML = `Issuer: <span class="text-success">${doc.issuer}</span><br>Token Endpoint: ${doc.token_endpoint}`;
      } else {
        oidcRes.innerHTML = `<span class="text-warning">HTTP ${res.status}: Không thể nạp OIDC config</span>`;
      }
    } catch (err) {
      oidcRes.innerHTML = `<span class="text-danger">Lỗi: ${err.message}</span>`;
    }
  });
}

// Tự động chuyển đổi các đường dẫn công cụ (localhost:port) sang IP hoặc hostname của server EC2 hiện tại
function updateDynamicHostLinks() {
  const currentHost = window.location.hostname;
  if (!currentHost || currentHost === 'localhost' || currentHost === '127.0.0.1') return;

  document.querySelectorAll('a[href*="localhost"]').forEach(link => {
    try {
      const url = new URL(link.href);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        url.hostname = currentHost;
        link.href = url.toString();
      }
    } catch (e) {
      console.error('Lỗi cập nhật URL công cụ:', e);
    }
  });
}

// Bắt sự kiện click để đảm bảo kể cả khi link chưa được thay thế vẫn trỏ đúng host hiện tại
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href*="localhost"]');
  if (link) {
    const currentHost = window.location.hostname;
    if (currentHost && currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
      try {
        const url = new URL(link.href);
        if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
          url.hostname = currentHost;
          link.href = url.toString();
        }
      } catch (err) {}
    }
  }
});

document.addEventListener('DOMContentLoaded', () => {
  initNavHighlight();
  updateNavAuth();
  updateDynamicHostLinks();
  loadStudents();
  initStudentTesters();
  initDiagnosticTools();

  // Refresh button
  document.getElementById('btn-refresh-students')?.addEventListener('click', () => {
    loadStudents();
  });

  // Login form handler
  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('login-username').value.trim();
    const p = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    errEl.classList.add('d-none');
    submitBtn.disabled = true;
    submitBtn.textContent = 'ĐANG XÁC THỰC OIDC...';

    try {
      const authData = await login(u, p);
      saveAuth(authData);
      updateNavAuth();
      const modalEl = document.getElementById('loginModal');
      const modal = bootstrap.Modal.getInstance(modalEl);
      modal?.hide();
      loadStudents();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('d-none');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Xác thực Keycloak OIDC';
    }
  });

  // Add student form handler
  document.getElementById('student-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const auth = getAuth();
    if (!auth || auth.role !== 'admin') {
      alert('Yêu cầu quyền Admin');
      return;
    }
    const data = {
      student_id: document.getElementById('st-id').value.trim(),
      fullname: document.getElementById('st-name').value.trim(),
      dob: document.getElementById('st-dob').value,
      major: document.getElementById('st-major').value.trim()
    };
    const res = await fetch(`${API_BASE}/students-db`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth.token}`
      },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      const modalEl = document.getElementById('studentModal');
      const modal = bootstrap.Modal.getInstance(modalEl);
      modal?.hide();
      document.getElementById('student-form').reset();
      loadStudents();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Lỗi thêm sinh viên');
    }
  });
});
