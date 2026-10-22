import { apiFetch } from '../api.js';
import { getAuth, navigate } from '../app.js';

export async function render(container, id) {
  if (!id) {
    navigate('#home');
    return;
  }

  container.innerHTML = `
    <article class="py-3 py-md-4">
      <!-- Back Navigation -->
      <div class="mb-4 pb-2 border-b-hairline d-flex justify-content-between align-items-center">
        <button class="btn btn-link p-0 text-dark font-mono small text-decoration-none" id="btn-back">
          &larr; BACK TO ARCHIVE
        </button>
        <span class="font-mono small text-muted">ENTRY &num;${id}</span>
      </div>

      <div id="blog-content-wrapper">
        <div class="py-5 text-center">
          <div class="spinner-border spinner-border-sm text-dark" role="status"></div>
          <div class="mt-2 font-mono small text-muted">LOADING ESSAY...</div>
        </div>
      </div>
    </article>
  `;

  document.getElementById('btn-back')?.addEventListener('click', () => {
    navigate('#home');
  });

  try {
    const res = await apiFetch(`/blogs/${id}`);
    if (!res.ok) {
      document.getElementById('blog-content-wrapper').innerHTML = `
        <div class="py-5 text-center">
          <h2 class="h3 font-serif text-muted mb-2">Monograph Not Found</h2>
          <p class="font-mono small text-secondary">The requested article ID #${id} is not present in the archive.</p>
        </div>
      `;
      return;
    }

    const blog = await res.json();
    const auth = getAuth();

    const isOwnerOrAdmin = auth && (auth.username.toUpperCase() === blog.author_id.toUpperCase() || auth.role === 'admin');

    const dateStr = blog.created_at ? new Date(blog.created_at).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric'
    }).toUpperCase() : 'UNKNOWN DATE';

    const imageHtml = blog.image_url ? `
      <figure class="my-5 text-center">
        <div style="border: 1px solid var(--border); background: var(--bg-alt);">
          <img src="${blog.image_url}" class="img-fluid w-100" style="max-height: 520px; object-fit: cover;" alt="${blog.title}">
        </div>
      </figure>
    ` : '';

    const actionsHtml = isOwnerOrAdmin ? `
      <div class="d-flex gap-2">
        <button class="btn btn-modern-outline btn-modern-sm" id="btn-edit-blog">
          Edit
        </button>
        <button class="btn btn-modern-outline btn-modern-sm text-danger" id="btn-delete-blog">
          Delete
        </button>
      </div>
    ` : '';

    document.getElementById('blog-content-wrapper').innerHTML = `
      <div class="mx-auto" style="max-width: 760px;">
        <!-- Header -->
        <header class="mb-4">
          <h1 class="display-4 font-serif fw-normal text-dark mb-4" style="line-height: 1.18; letter-spacing: -0.02em;">
            ${blog.title}
          </h1>

          <!-- Editorial Metadata Strip -->
          <div class="py-3 border-t-hairline border-b-hairline d-flex flex-wrap justify-content-between align-items-center gap-3">
            <div class="d-flex flex-wrap align-items-center gap-4 font-mono small text-muted">
              <div>
                <span class="text-uppercase" style="color: var(--ink-faint);">AUTHOR</span>
                <span class="text-dark fw-semibold ms-1">${blog.author_id}</span>
              </div>
              <div>
                <span class="text-uppercase" style="color: var(--ink-faint);">DATE</span>
                <span class="text-dark ms-1">${dateStr}</span>
              </div>
            </div>
            ${actionsHtml}
          </div>
        </header>

        <!-- Feature Image -->
        ${imageHtml}

        <!-- Essay Body -->
        <div class="essay-content pt-2 pb-5" style="font-size: 1.15rem; line-height: 1.85; color: #1e1e1d; white-space: pre-wrap; word-break: break-word;">
${blog.content}
        </div>

        <!-- Colophon Endmark -->
        <div class="pt-4 border-t-hairline text-center text-muted font-mono small">
          &mdash; END OF MONOGRAPH &mdash;
        </div>
      </div>
    `;

    if (isOwnerOrAdmin) {
      document.getElementById('btn-edit-blog')?.addEventListener('click', () => {
        navigate('#blog-form/' + blog.id);
      });
      document.getElementById('btn-delete-blog')?.addEventListener('click', async () => {
        if (!confirm('Xác nhận xóa vĩnh viễn bài viết này khỏi archive?')) return;
        const delRes = await apiFetch(`/blogs/${blog.id}`, { method: 'DELETE' });
        if (delRes.ok) {
          navigate('#home');
        } else {
          const err = await delRes.json();
          alert('Thao tác xóa thất bại: ' + (err.error || 'Lỗi'));
        }
      });
    }

  } catch (err) {
    document.getElementById('blog-content-wrapper').innerHTML = `
      <div class="alert alert-danger font-mono small rounded-0">Error: ${err.message}</div>
    `;
  }
}
