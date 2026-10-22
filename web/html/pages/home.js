import { apiFetch } from '../api.js';
import { getAuth, navigate } from '../app.js';

export async function render(container) {
  const auth = getAuth();

  container.innerHTML = `
    <!-- Hero Banner -->
    <div class="p-4 p-md-5 mb-4 rounded-4 text-white bg-primary bg-gradient shadow-sm position-relative overflow-hidden">
      <div class="col-md-8">
        <h1 class="display-6 fw-bold">Trang Blog Sinh Viên</h1>
        <p class="lead my-3">Không gian chia sẻ kiến thức, kinh nghiệm học tập và công nghệ điện toán đám mây.</p>
        ${
          auth 
            ? `<button class="btn btn-light btn-lg px-4 fw-semibold text-primary" id="btn-create-blog">
                 <i class="bi bi-pencil-square me-2"></i>Viết bài mới
               </button>`
            : `<button class="btn btn-outline-light btn-lg px-4" data-bs-toggle="modal" data-bs-target="#loginModal">
                 <i class="bi bi-box-arrow-in-right me-2"></i>Đăng nhập để viết bài
               </button>`
        }
      </div>
    </div>

    <!-- Blog List Header -->
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h3 class="fw-bold mb-0"><i class="bi bi-newspaper text-primary me-2"></i>Bài viết mới nhất</h3>
      <span class="text-muted small" id="blog-count">Đang tải...</span>
    </div>

    <!-- Blog Grid -->
    <div class="row g-4" id="blog-grid">
      <div class="col-12 text-center py-5">
        <div class="spinner-border text-primary" role="status"></div>
      </div>
    </div>
  `;

  document.getElementById('btn-create-blog')?.addEventListener('click', () => {
    navigate('#blog-form');
  });

  try {
    const res = await apiFetch('/blogs');
    const blogs = await res.json();
    const grid = document.getElementById('blog-grid');
    const countEl = document.getElementById('blog-count');

    if (!blogs || blogs.length === 0) {
      grid.innerHTML = `
        <div class="col-12 text-center py-5">
          <div class="text-muted fs-5">Chưa có bài viết nào. Hãy là người đầu tiên chia sẻ!</div>
        </div>
      `;
      countEl.textContent = '0 bài viết';
      return;
    }

    countEl.textContent = `${blogs.length} bài viết`;
    grid.innerHTML = blogs.map(blog => {
      const dateStr = blog.created_at ? new Date(blog.created_at).toLocaleDateString('vi-VN', {
        year: 'numeric', month: 'short', day: 'numeric'
      }) : 'Mới cập nhật';

      const snippet = blog.content ? (blog.content.length > 120 ? blog.content.substring(0, 120) + '...' : blog.content) : '';

      const imageHtml = blog.image_url 
        ? `<img src="${blog.image_url}" class="blog-img w-100" alt="${blog.title}" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'blog-placeholder-img\\'><i class=\\'bi bi-journal-text\\'></i></div>';">`
        : `<div class="blog-placeholder-img"><i class="bi bi-journal-text"></i></div>`;

      return `
        <div class="col-md-6 col-lg-4">
          <div class="card h-100 shadow-sm">
            ${imageHtml}
            <div class="card-body d-flex flex-column">
              <div class="d-flex justify-content-between align-items-center small text-muted mb-2">
                <span><i class="bi bi-person-fill text-primary"></i> ${blog.author_id}</span>
                <span><i class="bi bi-clock"></i> ${dateStr}</span>
              </div>
              <h5 class="card-title fw-bold text-dark mb-2">${blog.title}</h5>
              <p class="card-text text-secondary small flex-grow-1">${snippet}</p>
              <button class="btn btn-outline-primary btn-sm mt-3 w-100 fw-semibold" data-bid="${blog.id}">
                Đọc tiếp <i class="bi bi-arrow-right"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('button[data-bid]').forEach(btn => {
      btn.addEventListener('click', () => {
        navigate('#blog/' + btn.getAttribute('data-bid'));
      });
    });

  } catch (err) {
    const grid = document.getElementById('blog-grid');
    if (grid) {
      grid.innerHTML = `
        <div class="col-12">
          <div class="alert alert-danger">Không thể tải danh sách blog: ${err.message}</div>
        </div>
      `;
    }
  }
}
