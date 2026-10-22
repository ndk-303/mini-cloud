import { apiFetch } from '../api.js';
import { getAuth, navigate } from '../app.js';

export async function render(container) {
  const auth = getAuth();
  if (!auth || auth.role !== 'admin') {
    alert('Truy cập bị từ chối: Trang này yêu cầu quyền Quản trị viên (Admin).');
    navigate('#home');
    return;
  }

  container.innerHTML = `
    <div class="py-3 py-md-4">
      <!-- Admin Header -->
      <div class="d-flex flex-wrap justify-content-between align-items-end mb-4 pb-3 border-b-hairline gap-3">
        <div>
          <span class="font-mono text-danger small text-uppercase d-block mb-1">&bull; 03 / QUẢN TRỊ HỆ THỐNG</span>
          <h2 class="display-6 font-serif mb-1">Danh mục Sinh viên</h2>
          <p class="text-secondary small font-mono mb-0">
            Cơ sở dữ liệu: <strong>MariaDB &middot; studentdb.students</strong> &middot; Quyền Quản trị viên (Admin)
          </p>
        </div>
        <button class="btn btn-modern-primary" id="btn-open-add-student">
          &plus; Thêm sinh viên mới
        </button>
      </div>

      <!-- Students Table -->
      <div class="border-t-hairline border-b-hairline">
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0" style="background: transparent;">
            <thead>
              <tr class="font-mono small text-muted border-b-hairline">
                <th scope="col" style="width: 70px; font-weight: 500;">ID</th>
                <th scope="col" style="width: 140px; font-weight: 500;">MÃ SỐ SV</th>
                <th scope="col" style="font-weight: 500;">HỌ VÀ TÊN</th>
                <th scope="col" style="width: 150px; font-weight: 500;">NGÀY SINH</th>
                <th scope="col" style="font-weight: 500;">CHUYÊN NGÀNH</th>
                <th scope="col" class="text-end" style="width: 140px; font-weight: 500;">THAO TÁC</th>
              </tr>
            </thead>
            <tbody id="student-tbody">
              <tr>
                <td colspan="6" class="text-center py-5">
                  <div class="spinner-border spinner-border-sm text-dark"></div>
                  <div class="mt-2 font-mono small text-muted">ĐANG TRUY VẤN MARIADB...</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modernist Modal Thêm/Sửa Sinh Viên -->
    <div class="modal fade" id="studentModal" tabindex="-1" aria-labelledby="studentModalLabel" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content modern-modal">
          <div class="modal-header modern-header d-flex justify-content-between align-items-center">
            <div>
              <span class="font-mono text-muted small d-block mb-1">QUẢN LÝ DỮ LIỆU</span>
              <h5 class="mb-0 fw-semibold" id="studentModalLabel">Thêm sinh viên mới</h5>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button>
          </div>
          <div class="modal-body modern-body">
            <div class="alert alert-danger d-none font-mono small rounded-0" id="student-modal-error"></div>
            <form id="student-form">
              <input type="hidden" id="student-db-id">
              <div class="mb-3">
                <label class="form-label font-mono small text-uppercase" for="student-code">Mã số sinh viên (MSSV) <span class="text-danger">*</span></label>
                <input type="text" class="form-control font-mono" id="student-code" placeholder="Ví dụ: SV006" required>
              </div>
              <div class="mb-3">
                <label class="form-label font-mono small text-uppercase" for="student-fullname">Họ và tên <span class="text-danger">*</span></label>
                <input type="text" class="form-control font-sans" id="student-fullname" placeholder="Ví dụ: Nguyễn Văn A" required>
              </div>
              <div class="mb-3">
                <label class="form-label font-mono small text-uppercase" for="student-dob">Ngày sinh</label>
                <input type="date" class="form-control font-mono" id="student-dob">
              </div>
              <div class="mb-4">
                <label class="form-label font-mono small text-uppercase" for="student-major">Chuyên ngành đào tạo <span class="text-danger">*</span></label>
                <input type="text" class="form-control font-sans" id="student-major" placeholder="Ví dụ: Khoa học máy tính" required>
              </div>
              <button type="submit" class="btn btn-modern-primary w-100 py-2" id="btn-save-student">
                Lưu vào CSDL
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  `;

  const studentModalEl = document.getElementById('studentModal');
  const studentModal = new bootstrap.Modal(studentModalEl);

  async function loadStudents() {
    const tbody = document.getElementById('student-tbody');
    try {
      const res = await apiFetch('/students-db');
      if (!res.ok) {
        tbody.innerHTML = `
          <tr><td colspan="6" class="text-center py-4 text-danger font-mono small">TỪ CHỐI TRUY CẬP HOẶC LỖI MÁY CHỦ (${res.status}).</td></tr>
        `;
        return;
      }

      const students = await res.json();
      if (!students || students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted font-mono small">CHƯA CÓ DỮ LIỆU SINH VIÊN TRONG CSDL.</td></tr>`;
        return;
      }

      tbody.innerHTML = students.map(s => {
        const dobStr = s.dob ? (s.dob.split('T')[0] || s.dob) : '—';
        return `
          <tr class="border-b-hairline font-sans">
            <td class="font-mono text-muted small">${s.id}</td>
            <td><strong class="font-mono text-dark">${s.student_id}</strong></td>
            <td class="fw-semibold">${s.fullname}</td>
            <td class="font-mono small text-muted">${dobStr}</td>
            <td>
              <span class="font-mono small px-2 py-1" style="border: 1px solid var(--border); background: var(--bg-alt);">${s.major}</span>
            </td>
            <td class="text-end">
              <button class="btn btn-link text-dark font-mono small text-decoration-none p-0 me-3" data-edit-id="${s.id}" data-sid="${s.student_id}" data-name="${s.fullname}" data-dob="${dobStr}" data-major="${s.major}">
                Sửa
              </button>
              <button class="btn btn-link text-danger font-mono small text-decoration-none p-0" data-delete-id="${s.id}" data-sid="${s.student_id}">
                Xóa
              </button>
            </td>
          </tr>
        `;
      }).join('');

      tbody.querySelectorAll('button[data-edit-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          document.getElementById('studentModalLabel').textContent = 'Chỉnh sửa sinh viên #' + btn.getAttribute('data-edit-id');
          document.getElementById('student-db-id').value = btn.getAttribute('data-edit-id');
          document.getElementById('student-code').value = btn.getAttribute('data-sid');
          document.getElementById('student-fullname').value = btn.getAttribute('data-name');
          document.getElementById('student-dob').value = btn.getAttribute('data-dob') === '—' ? '' : btn.getAttribute('data-dob');
          document.getElementById('student-major').value = btn.getAttribute('data-major');
          document.getElementById('student-modal-error').classList.add('d-none');
          studentModal.show();
        });
      });

      tbody.querySelectorAll('button[data-delete-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const sid = btn.getAttribute('data-delete-id');
          const code = btn.getAttribute('data-sid');
          if (!confirm(`Xác nhận xóa sinh viên ${code} (ID: ${sid}) khỏi cơ sở dữ liệu?`)) return;
          const delRes = await apiFetch(`/students-db/${sid}`, { method: 'DELETE' });
          if (delRes.ok) {
            loadStudents();
          } else {
            const err = await delRes.json();
            alert('Không thể xóa sinh viên: ' + (err.error || 'Lỗi'));
          }
        });
      });

    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger font-mono small">LỖI: ${e.message}</td></tr>`;
    }
  }

  document.getElementById('btn-open-add-student')?.addEventListener('click', () => {
    document.getElementById('studentModalLabel').textContent = 'Thêm sinh viên mới';
    document.getElementById('student-form').reset();
    document.getElementById('student-db-id').value = '';
    document.getElementById('student-modal-error').classList.add('d-none');
    studentModal.show();
  });

  document.getElementById('student-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const id = document.getElementById('student-db-id').value;
    const student_id = document.getElementById('student-code').value.trim();
    const fullname = document.getElementById('student-fullname').value.trim();
    const dob = document.getElementById('student-dob').value;
    const major = document.getElementById('student-major').value.trim();
    const errEl = document.getElementById('student-modal-error');
    const submitBtn = document.getElementById('btn-save-student');

    errEl.classList.add('d-none');
    submitBtn.disabled = true;

    try {
      const payload = { student_id, fullname, dob: dob || null, major };
      const url = id ? `/students-db/${id}` : '/students-db';
      const method = id ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Thao tác không thành công.');
      }

      studentModal.hide();
      loadStudents();

    } catch (err) {
      errEl.textContent = err.message || 'Lỗi khi lưu';
      errEl.classList.remove('d-none');
    } finally {
      submitBtn.disabled = false;
    }
  });

  loadStudents();
}
