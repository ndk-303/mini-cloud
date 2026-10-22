import { apiFetch } from '../api.js';
import { getAuth, navigate } from '../app.js';

export async function render(container) {
  const auth = getAuth();

  container.innerHTML = `
    <!-- Editorial Header Section -->
    <section class="py-4 py-md-5 border-b-hairline mb-5">
      <div class="row align-items-end justify-content-between g-4">
        <div class="col-lg-8">
          <span class="font-mono text-muted small text-uppercase d-block mb-2">01 / LƯU TRỮ &middot; BÀI VIẾT KỸ THUẬT</span>
          <h1 class="display-4 fw-normal font-serif mb-3" style="line-height: 1.15;">
            Diễn Đàn Sinh Viên
          </h1>
          <p class="text-secondary fs-5 mb-0" style="max-width: 680px; font-weight: 400; line-height: 1.6;">
            Tuyển tập nghiên cứu khoa học, kiến trúc hạ tầng đám mây và ghi chép kỹ thuật của sinh viên.
          </p>
        </div>
        <div class="col-lg-3 text-lg-end">
          ${
            auth 
              ? `<button class="btn btn-modern-primary" id="btn-create-blog">
                   Viết bài mới &rarr;
                 </button>`
              : `<button class="btn btn-modern-outline" data-bs-toggle="modal" data-bs-target="#loginModal">
                   Đăng nhập để viết bài
                 </button>`
          }
        </div>
      </div>
    </section>

    <!-- Articles List Container -->
    <section>
      <div class="d-flex justify-content-between align-items-center mb-4 pb-2 border-b-hairline">
        <span class="font-mono text-uppercase small text-muted">BÀI VIẾT</span>
        <span class="font-mono small text-muted" id="blog-count">ĐANG TẢI...</span>
      </div>

      <div id="articles-stream" class="d-flex flex-column">
        <div class="py-5 text-center">
          <div class="spinner-border spinner-border-sm text-dark" role="status"></div>
          <div class="mt-2 font-mono small text-muted">ĐANG ĐỌC DỮ LIỆU...</div>
        </div>
      </div>
    </section>
  `;

  document.getElementById('btn-create-blog')?.addEventListener('click', () => {
    navigate('#blog-form');
  });

  try {
    const res = await apiFetch('/blogs');
    const blogs = await res.json();
    const stream = document.getElementById('articles-stream');
    const countEl = document.getElementById('blog-count');

    if (!blogs || blogs.length === 0) {
      stream.innerHTML = `
        <div class="py-5 text-center">
          <p class="font-serif fs-4 text-muted mb-2">Chưa có bài viết nào trong lưu trữ.</p>
          <p class="text-muted small font-mono">Bấm nút phía trên để đăng bài viết đầu tiên.</p>
        </div>
      `;
      countEl.textContent = '0 BÀI VIẾT';
      return;
    }

    countEl.textContent = `${blogs.length} BÀI VIẾT`;

    stream.innerHTML = blogs.map((blog, idx) => {
      const indexNumber = String(idx + 1).padStart(2, '0');
      const dateStr = blog.created_at ? new Date(blog.created_at).toLocaleDateString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      }) : 'MỚI ĐĂNG';

      const snippet = blog.content ? (blog.content.length > 210 ? blog.content.substring(0, 210) + '...' : blog.content) : '';

      const imageCol = blog.image_url ? `
        <div class="col-md-4 col-lg-3 text-md-end order-1 order-md-2 mb-3 mb-md-0">
          <div class="article-thumb-wrapper overflow-hidden" style="border: 1px solid var(--border); background: var(--bg-alt);">
            <img src="${blog.image_url}" class="img-fluid w-100" style="aspect-ratio: 16/10; object-fit: cover;" alt="${blog.title}" onerror="this.parentElement.style.display='none';">
          </div>
        </div>
      ` : '';

      const contentColClass = blog.image_url ? 'col-md-8 col-lg-9 order-2 order-md-1' : 'col-12';

      return `
        <article class="article-entry py-4 py-md-5 border-b-hairline">
          <div class="row g-4 align-items-start">
            <div class="${contentColClass}">
              <div class="d-flex align-items-center gap-3 font-mono small text-muted mb-2">
                <span class="text-dark fw-semibold">${indexNumber}</span>
                <span>&sol;</span>
                <span>${dateStr}</span>
                <span>&sol;</span>
                <span class="text-uppercase">TÁC GIẢ: ${blog.author_id}</span>
              </div>
              
              <h2 class="h2 font-serif mb-3">
                <a href="#blog/${blog.id}" class="text-dark text-decoration-none article-title-link">
                  ${blog.title}
                </a>
              </h2>

              <p class="text-secondary mb-3" style="line-height: 1.7; max-width: 760px;">
                ${snippet}
              </p>

              <div>
                <a href="#blog/${blog.id}" class="font-mono small text-dark text-decoration-none fw-semibold read-link">
                  ĐỌC BÀI VIẾT &rarr;
                </a>
              </div>
            </div>
            ${imageCol}
          </div>
        </article>
      `;
    }).join('');

    // Add inline styling for article hover effect
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      .article-entry {
        transition: background-color 0.15s ease;
      }
      .article-title-link {
        transition: color 0.15s ease;
      }
      .article-title-link:hover {
        color: var(--accent) !important;
        text-decoration: underline;
        text-underline-offset: 4px;
      }
      .read-link {
        letter-spacing: 0.05em;
        display: inline-block;
        border-bottom: 1px solid transparent;
        transition: all 0.15s ease;
      }
      .read-link:hover {
        color: var(--accent) !important;
        border-bottom-color: var(--accent);
      }
    `;
    stream.appendChild(styleEl);

  } catch (err) {
    const stream = document.getElementById('articles-stream');
    if (stream) {
      stream.innerHTML = `
        <div class="alert alert-danger font-mono small rounded-0">
          KHÔNG THỂ KẾT NỐI MÁY CHỦ ỨNG DỤNG: ${err.message}
        </div>
      `;
    }
  }
}
