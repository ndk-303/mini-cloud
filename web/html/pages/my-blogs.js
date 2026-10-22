import { apiFetch } from '../api.js';
import { getAuth, navigate } from '../app.js';

export async function render(container) {
  const auth = getAuth();
  if (!auth) {
    navigate('#home');
    return;
  }

  container.innerHTML = `
    <div class="py-3 py-md-4">
      <div class="d-flex flex-wrap justify-content-between align-items-end mb-4 pb-3 border-b-hairline gap-3">
        <div>
          <span class="font-mono text-muted small text-uppercase d-block mb-1">02 / PERSONAL RECORD</span>
          <h2 class="display-6 font-serif mb-1">My Writings</h2>
          <p class="text-secondary small font-mono mb-0">
            Author: <strong class="text-dark">${auth.username}</strong> &middot; Role: <strong>${auth.role.toUpperCase()}</strong>
          </p>
        </div>
        <button class="btn btn-modern-primary" id="btn-create-my-blog">
          Write New Monograph &rarr;
        </button>
      </div>

      <!-- Ledger Table -->
      <div class="border-t-hairline border-b-hairline">
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0" style="background: transparent;">
            <thead>
              <tr class="font-mono small text-muted border-b-hairline">
                <th scope="col" style="width: 60px; font-weight: 500;">NO.</th>
                <th scope="col" style="font-weight: 500;">MONOGRAPH TITLE</th>
                <th scope="col" style="width: 140px; font-weight: 500;">AUTHOR</th>
                <th scope="col" style="width: 180px; font-weight: 500;">PUBLISHED</th>
                <th scope="col" class="text-end" style="width: 160px; font-weight: 500;">OPERATIONS</th>
              </tr>
            </thead>
            <tbody id="my-blogs-tbody">
              <tr>
                <td colspan="5" class="text-center py-5">
                  <div class="spinner-border spinner-border-sm text-dark"></div>
                  <div class="mt-2 font-mono small text-muted">LOADING WRITINGS...</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
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

    const myBlogs = auth.role === 'admin' 
      ? blogs 
      : blogs.filter(b => (b.author_id || '').toUpperCase() === auth.username.toUpperCase());

    if (!myBlogs || myBlogs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-5">
            <p class="font-serif fs-5 text-muted mb-2">No personal publications found in archive.</p>
            <p class="font-mono small text-secondary">Click the button above to begin writing your first entry.</p>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = myBlogs.map((blog, idx) => {
      const num = String(idx + 1).padStart(2, '0');
      const dateStr = blog.created_at ? new Date(blog.created_at).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
      }).toUpperCase() : 'RECENT';

      return `
        <tr class="border-b-hairline">
          <td class="font-mono text-muted small">${num}</td>
          <td>
            <a href="#blog/${blog.id}" class="text-dark fw-semibold text-decoration-none font-serif fs-5 d-block" style="line-height: 1.3;">
              ${blog.title}
            </a>
          </td>
          <td class="font-mono small text-muted">${blog.author_id}</td>
          <td class="font-mono small text-muted">${dateStr}</td>
          <td class="text-end">
            <button class="btn btn-link text-dark font-mono small text-decoration-none p-0 me-3" data-action="edit" data-id="${blog.id}">
              Edit
            </button>
            <button class="btn btn-link text-danger font-mono small text-decoration-none p-0" data-action="delete" data-id="${blog.id}">
              Delete
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
        if (!confirm('Xác nhận xóa bài viết này khỏi archive?')) return;
        const delRes = await apiFetch(`/blogs/${bid}`, { method: 'DELETE' });
        if (delRes.ok) {
          render(container);
        } else {
          const err = await delRes.json();
          alert('Lỗi xóa bài: ' + (err.error || 'Lỗi'));
        }
      });
    });

  } catch (err) {
    const tbody = document.getElementById('my-blogs-tbody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-4 text-danger font-mono small">ERROR: ${err.message}</td>
        </tr>
      `;
    }
  }
}
