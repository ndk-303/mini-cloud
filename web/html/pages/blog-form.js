import { apiFetch, uploadFile } from '../api.js';
import { getAuth, navigate } from '../app.js';

export async function render(container, id) {
  const auth = getAuth();
  if (!auth) {
    navigate('#home');
    return;
  }

  const isEdit = Boolean(id);

  container.innerHTML = `
    <div class="py-3 py-md-4">
      <div class="mx-auto" style="max-width: 820px;">
        <!-- Top Action Bar -->
        <div class="mb-4 pb-3 border-b-hairline d-flex justify-content-between align-items-center">
          <button type="button" class="btn btn-link p-0 text-dark font-mono small text-decoration-none" id="btn-cancel">
            &larr; HỦY BÀI VIẾT
          </button>
          <div class="d-flex align-items-center gap-2">
            <span class="font-mono small text-muted">TÁC GIẢ: <strong class="text-dark">${auth.username}</strong></span>
          </div>
        </div>

        <div class="alert alert-danger d-none font-mono small rounded-0" id="form-error"></div>

        <form id="blog-form">
          <!-- Draft Title -->
          <div class="mb-4">
            <label class="font-mono small text-muted text-uppercase d-block mb-1">01 / TIÊU ĐỀ BÀI VIẾT</label>
            <input type="text" class="form-control form-control-lg font-serif border-0 px-0 shadow-none" 
                   id="blog-title" placeholder="Nhập tiêu đề bài viết của bạn..." 
                   style="font-size: 2.2rem; border-bottom: 1px solid var(--border) !important; background: transparent; border-radius: 0;" required>
          </div>

          <!-- Feature Image Uploader -->
          <div class="mb-4 p-3 border-hairline" style="background: var(--bg-alt); border: 1px dashed var(--border);">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="font-mono small text-uppercase fw-semibold text-dark">02 / ĐÍNH KÈM ẢNH (SEAWEEDFS S3)</span>
              <span class="font-mono small text-muted">TƯƠNG THÍCH CHUẨN S3</span>
            </div>
            
            <input type="file" class="form-control form-control-sm font-mono" id="blog-image" accept="image/*">
            <div class="form-text font-mono small text-muted">Hỗ trợ JPG, PNG, WEBP, GIF. Tải trực tiếp lên cụm S3.</div>
            
            <div id="image-preview-wrapper" class="mt-3 d-none">
              <span class="font-mono small text-muted d-block mb-1">XEM TRƯỚC ẢNH ĐÍNH KÈM:</span>
              <img id="image-preview" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3C/svg%3E" class="img-fluid" style="max-height: 240px; border: 1px solid var(--border);" alt="Attachment Preview">
            </div>
          </div>

          <!-- Draft Body -->
          <div class="mb-4">
            <label class="font-mono small text-muted text-uppercase d-block mb-1">03 / NỘI DUNG BÀI VIẾT</label>
            <textarea class="form-control border-hairline p-3 font-sans" id="blog-content" rows="14" 
                      placeholder="Bắt đầu soạn thảo nghiên cứu, ghi chú hoặc nội dung phân tích..." 
                      style="font-size: 1.05rem; line-height: 1.7; background: #FFFFFF; resize: vertical;" required></textarea>
          </div>

          <!-- Submit Buttons -->
          <div class="pt-4 border-t-hairline d-flex justify-content-end gap-3">
            <button type="button" class="btn btn-modern-outline" id="btn-cancel-bottom">Hủy</button>
            <button type="submit" class="btn btn-modern-primary" id="btn-submit">
              ${isEdit ? 'Lưu thay đổi' : 'Xuất bản bài viết &rarr;'}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  const cancelAction = () => navigate('#my-blogs');
  document.getElementById('btn-cancel')?.addEventListener('click', cancelAction);
  document.getElementById('btn-cancel-bottom')?.addEventListener('click', cancelAction);

  const fileInput = document.getElementById('blog-image');
  const previewWrapper = document.getElementById('image-preview-wrapper');
  const previewImg = document.getElementById('image-preview');

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = e => {
        previewImg.src = e.target.result;
        previewWrapper.classList.remove('d-none');
      };
      reader.readAsDataURL(file);
    } else {
      previewWrapper.classList.add('d-none');
    }
  });

  let existingImageUrl = null;

  if (isEdit) {
    try {
      const res = await apiFetch(`/blogs/${id}`);
      if (res.ok) {
        const blog = await res.json();
        document.getElementById('blog-title').value = blog.title || '';
        document.getElementById('blog-content').value = blog.content || '';
        if (blog.image_url) {
          existingImageUrl = blog.image_url;
          previewImg.src = blog.image_url;
          previewWrapper.classList.remove('d-none');
        }
      }
    } catch (e) {
      console.error('Failed to pre-populate blog draft:', e);
    }
  }

  document.getElementById('blog-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const title = document.getElementById('blog-title').value.trim();
    const content = document.getElementById('blog-content').value.trim();
    const submitBtn = document.getElementById('btn-submit');
    const errEl = document.getElementById('form-error');

    errEl.classList.add('d-none');
    submitBtn.disabled = true;
    submitBtn.textContent = 'ĐANG XỬ LÝ...';

    try {
      let finalImageUrl = existingImageUrl;
      const file = fileInput.files[0];

      if (file) {
        submitBtn.textContent = 'ĐANG TẢI ẢNH LÊN S3...';
        const uploadRes = await uploadFile(file);
        if (uploadRes.url) {
          finalImageUrl = uploadRes.url;
        } else if (uploadRes.error) {
          throw new Error('Lỗi tải ảnh lên S3: ' + uploadRes.error);
        }
      }

      submitBtn.textContent = isEdit ? 'ĐANG CẬP NHẬT...' : 'ĐANG XUẤT BẢN...';

      const payload = {
        title,
        content,
        image_url: finalImageUrl
      };

      const url = isEdit ? `/blogs/${id}` : '/blogs';
      const method = isEdit ? 'PUT' : 'POST';

      const saveRes = await apiFetch(url, {
        method,
        body: JSON.stringify(payload)
      });

      if (!saveRes.ok) {
        const err = await saveRes.json();
        throw new Error(err.error || 'Lưu bài viết thất bại.');
      }

      navigate('#my-blogs');

    } catch (err) {
      errEl.textContent = err.message || 'Có lỗi xảy ra trong quá trình lưu bài.';
      errEl.classList.remove('d-none');
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Lưu thay đổi' : 'Xuất bản bài viết →';
    }
  });
}
