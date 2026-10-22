// Client-side interactions for MyMiniCloud Multi-Page System

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

function updateNavAuth() {
  const auth = getAuth();
  const navAuth = document.getElementById('nav-auth');
  const addStudentBtn = document.getElementById('btn-add-student-modal');
  const adminCols = document.querySelectorAll('.admin-col');

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
        <span class="spinner-border spinner-border-sm me-2"></span> ĐANG TẢI DỮ LIỆU...
      </td>
    </tr>
  `;

  try {
    // Try fetching from database API first; if unauthenticated, fallback to public student JSON
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
            CHƯA CÓ BẢN GHI SINH VIÊN NÀO.
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

document.addEventListener('DOMContentLoaded', () => {
  updateNavAuth();
  loadStudents();

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
