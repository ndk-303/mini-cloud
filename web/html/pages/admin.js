import { apiFetch } from '../api.js';
import { getAuth, navigate } from '../app.js';

export async function render(container) {
  const auth = getAuth();
  if (!auth || auth.role !== 'admin') {
    alert('Trang này chỉ dành riêng cho Quản trị viên (Admin)!');
    navigate('#home');
    return;
  }

  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom">
      <div>
        <h2 class="fw-bold mb-1 text-danger">
          <i class="bi bi-shield-check me-2"></i>Quản trị Danh sách Sinh viên
        </h2>
        <p class="text-muted small mb-0">Quản lý trực tiếp trên MariaDB qua các API <code>/api/students-db</code> có xác thực Role Admin</p>
      </div>
      <button class="btn btn-success fw-semibold" id="btn-open-add-student">
        <i class="bi bi-person-plus-fill me-1"></i>Thêm sinh viên mới
      </button>
    </div>

    <!-- Student Table Card -->
    <div class="card border-0 shadow-sm rounded-4 overflow-hidden mb-4">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th scope="col" style="width: 70px;">ID</th>
              <th scope="col" style="width: 140px;">Mã SV (MSSV)</th>
              <th scope="col">Họ và tên</th>
              <th scope="col" style="width: 150px;">Ngày sinh</th>
              <th scope="col">Chuyên ngành</th>
              <th scope="col" class="text-end" style="width: 160px;">Thao tác</th>
            </tr>
          </thead>
          <tbody id="student-tbody">
            <tr>
              <td colspan="6" class="text-center py-4">
                <div class="spinner-border spinner-border-sm text-primary"></div> Đang tải danh sách sinh viên...
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal Thêm/Sửa Sinh Viên -->
    <div class="modal fade" id="studentModal" tabindex="-1" aria-labelledby="studentModalLabel" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content rounded-4 border-0 shadow">
          <div class="modal-header border-bottom-0 pb-0">
            <h5 class="modal-title fw-bold" id="studentModalLabel">Thêm sinh viên</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body p-4">
            <div class="alert alert-danger d-none py-2" id="student-modal-error"></div>
            <form id="student-form">
              <input type="hidden" id="student-db-id">
              <div class="mb-3">
                <label class="form-label fw-semibold" for="student-code">Mã số sinh viên (MSSV) <span class="text-danger">*</span></label>
                <input type="text" class="form-control" id="student-code" placeholder="Ví dụ: SV006" required>
              </div>
              <div class="mb-3">
                <label class="form-label fw-semibold" for="student-fullname">Họ và tên <span class="text-danger">*</span></label>
                <input type="text" class="form-control" id="student-fullname" placeholder="Nguyễn Văn A" required>
              </div>
              <div class="mb-3">
                <label class="form-label fw-semibold" for="student-dob">Ngày sinh</label>
                <input type="date" class="form-control" id="student-dob">
              </div>
              <div class="mb-4">
                <label class="form-label fw-semibold" for="student-major">Chuyên ngành <span class="text-danger">*</span></label>
                <input type="text" class="form-control" id="student-major" placeholder="Computer Science" required>
              </div>
              <button type="submit" class="btn btn-primary w-100 py-2 fw-semibold" id="btn-save-student">
                Lưu thông tin
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
          <tr><td colspan="6" class="text-center py-4 text-danger">Không có quyền truy cập hoặc lỗi máy chủ (${res.status}).</td></tr>
        `;
        return;
      }

      const students = await res.json();
      if (!students || students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">Chưa có sinh viên nào trong CSDL.</td></tr>`;
        return;
      }

      tbody.innerHTML = students.map(s => {
        const dobStr = s.dob ? (s.dob.split('T')[0] || s.dob) : '-';
        return `
          <tr>
            <td class="text-muted">${s.id}</td>
            <td><strong class="text-primary">${s.student_id}</strong></td>
            <td class="fw-semibold">${s.fullname}</td>
            <td>${dobStr}</td>
            <td><span class="badge bg-info-subtle text-info-emphasis">${s.major}</span></td>
            <td class="text-end">
              <button class="btn btn-sm btn-outline-primary me-1" data-edit-id="${s.id}" data-sid="${s.student_id}" data-name="${s.fullname}" data-dob="${dobStr}" data-major="${s.major}">
                <i class="bi bi-pencil"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger" data-delete-id="${s.id}" data-sid="${s.student_id}">
                <i class="bi bi-trash"></i>
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
          document.getElementById('student-dob').value = btn.getAttribute('data-dob') === '-' ? '' : btn.getAttribute('data-dob');
          document.getElementById('student-major').value = btn.getAttribute('data-major');
          document.getElementById('student-modal-error').classList.add('d-none');
          studentModal.show();
        });
      });

      tbody.querySelectorAll('button[data-delete-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const sid = btn.getAttribute('data-delete-id');
          const code = btn.getAttribute('data-sid');
          if (!confirm(`Bạn có chắc chắn muốn xóa sinh viên ${code} (ID: ${sid})?`)) return;
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
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger">Lỗi: ${e.message}</td></tr>`;
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
        throw new Error(err.error || 'Thao tác thất bại');
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
