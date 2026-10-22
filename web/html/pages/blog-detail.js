import { apiFetch } from '../api.js';
import { getAuth, navigate } from '../app.js';

export async function render(container, id) {
  if (!id) {
    navigate('#home');
    return;
  }

  container.innerHTML = `
    <div class="row justify-content-center">
      <div class="col-lg-9">
        <div class="mb-3">
          <button class="btn btn-outline-secondary btn-sm" id="btn-back">
            <i class="bi bi-arrow-left me-1"></i>Quay lại danh sách
          </button>
        </div>
        <div id="blog-content-wrapper">
          <div class="text-center py-5">
            <div class="spinner-border text-primary" role="status"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-back')?.addEventListener('click', () => {
    navigate('#home');
  });

  try {
    const res = await apiFetch(`/blogs/${id}`);
    if (!res.ok) {
      document.getElementById('blog-content-wrapper').innerHTML = `
        <div class="alert alert-warning">Không tìm thấy bài viết (ID: ${id}).</div>
      `;
      return;
    }

    const blog = await res.json();
    const auth = getAuth();

    const isOwnerOrAdmin = auth && (auth.username.toUpperCase() === blog.author_id.toUpperCase() || auth.role === 'admin');

    const dateStr = blog.created_at ? new Date(blog.created_at).toLocaleDateString('vi-VN', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : '';

    const imageHtml = blog.image_url 
      ? `<div class="mb-4 text-center">
           <img src="${blog.image_url}" class="img-fluid rounded-4 shadow-sm w-100" style="max-height: 450px; object-fit: cover;" alt="${blog.title}">
         </div>`
      : '';

    document.getElementById('blog-content-wrapper').innerHTML = `
      <article class="card p-4 p-md-5 shadow-sm border-0 bg-white">
        <!-- Actions for Owner or Admin -->
        ${
          isOwnerOrAdmin ? `
            <div class="d-flex justify-content-end gap-2 mb-3">
              <button class="btn btn-outline-primary btn-sm" id="btn-edit-blog">
                <i class="bi bi-pencil me-1"></i>Chỉnh sửa
              </button>
              <button class="btn btn-outline-danger btn-sm" id="btn-delete-blog">
                <i class="bi bi-trash me-1"></i>Xóa bài
              </button>
            </div>
          ` : ''
        }

        <h1 class="fw-bold mb-3 text-dark">${blog.title}</h1>
        <div class="d-flex align-items-center text-muted small pb-3 mb-4 border-bottom gap-3">
          <span><i class="bi bi-person-circle text-primary fs-6 me-1"></i><strong>${blog.author_id}</strong></span>
          <span><i class="bi bi-calendar3 me-1"></i>${dateStr}</span>
        </div>

        ${imageHtml}

        <div class="blog-body fs-5 lh-lg text-dark" style="white-space: pre-wrap; word-break: break-word;">
${blog.content}
        </div>
      </article>
    `;

    if (isOwnerOrAdmin) {
      document.getElementById('btn-edit-blog')?.addEventListener('click', () => {
        navigate('#blog-form/' + blog.id);
      });
      document.getElementById('btn-delete-blog')?.addEventListener('click', async () => {
        if (!confirm('Bạn có chắc chắn muốn xóa bài viết này không?')) return;
        const delRes = await apiFetch(`/blogs/${blog.id}`, { method: 'DELETE' });
        if (delRes.ok) {
          alert('Đã xóa bài viết thành công.');
          navigate('#home');
        } else {
          const err = await delRes.json();
          alert('Xóa bài thất bại: ' + (err.error || 'Lỗi'));
        }
      });
    }

  } catch (err) {
    document.getElementById('blog-content-wrapper').innerHTML = `
      <div class="alert alert-danger">Lỗi tải bài viết: ${err.message}</div>
    `;
  }
}
