import { apiFetch } from '../api.js';
import { getAuth, navigate } from '../app.js';

export async function render(container) {
  const auth = getAuth();
  if (!auth) {
    navigate('#home');
    return;
  }

  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom">
      <div>
        <h2 class="fw-bold mb-1"><i class="bi bi-collection text-primary me-2"></i>Quản lý bài viết của tôi</h2>
        <p class="text-muted small mb-0">Tài khoản: <strong>${auth.username}</strong> (${auth.role === 'admin' ? 'Quản trị viên' : 'Sinh viên'})</p>
      </div>
      <button class="btn btn-primary fw-semibold" id="btn-create-my-blog">
        <i class="bi bi-pencil-square me-1"></i>Viết bài mới
      </button>
    </div>

    <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th scope="col" style="width: 70px;">Ảnh</th>
              <th scope="col">Tiêu đề bài viết</th>
              <th scope="col" style="width: 130px;">Tác giả</th>
              <th scope="col" style="width: 170px;">Ngày đăng</th>
              <th scope="col" class="text-end" style="width: 180px;">Hành động</th>
            </tr>
          </thead>
          <tbody id="my-blogs-tbody">
            <tr>
              <td colspan="5" class="text-center py-4">
                <div class="spinner-border spinner-border-sm text-primary"></div> Đang tải...
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('btn-create-my-blog')?.addEventListener('click', () => {
    navigate('#blog-form');
  });

  try {
    const res = await apiFetch('/blogs');
    const blogs = await res.json();
    const tbody = document.getElementById('my-blogs-tbody');

    // Lọc theo author_id nếu là sinh viên; nếu admin thì hiển thị tất cả bài
    const myBlogs = auth.role === 'admin' 
      ? blogs 
      : blogs.filter(b => (b.author_id || '').toUpperCase() === auth.username.toUpperCase());

    if (!myBlogs || myBlogs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-5 text-muted">
            <i class="bi bi-inbox fs-2 d-block mb-2"></i>
            Bạn chưa đăng bài viết nào. Hãy bấm <strong>Viết bài mới</strong> để bắt đầu!
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = myBlogs.map(blog => {
      const dateStr = blog.created_at ? new Date(blog.created_at).toLocaleDateString('vi-VN', {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      }) : '-';

      const thumb = blog.image_url 
        ? `<img src="${blog.image_url}" class="rounded" style="width: 48px; height: 48px; object-fit: cover;">`
        : `<div class="bg-light text-primary rounded d-flex align-items-center justify-content-center" style="width: 48px; height: 48px;"><i class="bi bi-file-text"></i></div>`;

      return `
        <tr>
          <td>${thumb}</td>
          <td>
            <a href="#blog/${blog.id}" class="fw-semibold text-dark text-decoration-none hover-primary">${blog.title}</a>
          </td>
          <td><span class="badge bg-secondary-subtle text-secondary-emphasis">${blog.author_id}</span></td>
          <td class="small text-muted">${dateStr}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary me-1" data-action="edit" data-id="${blog.id}" title="Sửa bài">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${blog.id}" title="Xóa bài">
              <i class="bi bi-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('button[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        navigate('#blog-form/' + btn.getAttribute('data-id'));
      });
    });

    tbody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const bid = btn.getAttribute('data-id');
        if (!confirm('Bạn có chắc chắn muốn xóa bài viết này không?')) return;
        const delRes = await apiFetch(`/blogs/${bid}`, { method: 'DELETE' });
        if (delRes.ok) {
          render(container);
        } else {
          const err = await delRes.json();
          alert('Không thể xóa bài viết: ' + (err.error || 'Lỗi'));
        }
      });
    });

  } catch (err) {
    const tbody = document.getElementById('my-blogs-tbody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-4 text-danger">Lỗi tải dữ liệu: ${err.message}</td>
        </tr>
      `;
    }
  }
}
