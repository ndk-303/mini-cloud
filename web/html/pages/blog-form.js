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
    <div class="row justify-content-center">
      <div class="col-lg-8">
        <div class="card p-4 p-md-5 shadow-sm border-0 bg-white">
          <div class="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom">
            <h3 class="fw-bold mb-0">
              <i class="bi ${isEdit ? 'bi-pencil-square' : 'bi-plus-circle'} text-primary me-2"></i>
              ${isEdit ? 'Chỉnh sửa bài viết' : 'Tạo bài viết mới'}
            </h3>
            <span class="badge bg-light text-dark border">Tác giả: <strong>${auth.username}</strong></span>
          </div>

          <div class="alert alert-danger d-none" id="form-error"></div>

          <form id="blog-form">
            <div class="mb-3">
              <label class="form-label fw-semibold" for="blog-title">Tiêu đề bài viết <span class="text-danger">*</span></label>
              <input type="text" class="form-control form-control-lg" id="blog-title" placeholder="Nhập tiêu đề hấp dẫn..." required>
            </div>

            <div class="mb-3">
              <label class="form-label fw-semibold" for="blog-content">Nội dung bài viết <span class="text-danger">*</span></label>
              <textarea class="form-control" id="blog-content" rows="9" placeholder="Viết nội dung bài viết của bạn tại đây..." required></textarea>
            </div>

            <div class="mb-4">
              <label class="form-label fw-semibold" for="blog-image">Ảnh minh họa (Upload lên SeaweedFS S3)</label>
              <input type="file" class="form-control" id="blog-image" accept="image/*">
              <div class="form-text">Hỗ trợ các định dạng PNG, JPG, JPEG, GIF. Tối đa 5MB.</div>
              <div id="image-preview-wrapper" class="mt-3 d-none">
                <span class="small text-muted d-block mb-1">Xem trước ảnh:</span>
                <img id="image-preview" src="" class="img-thumbnail" style="max-height: 220px; object-fit: cover;" alt="Preview">
              </div>
            </div>

            <div class="d-flex justify-content-end gap-2 pt-3 border-top">
              <button type="button" class="btn btn-outline-secondary px-4" id="btn-cancel">Hủy</button>
              <button type="submit" class="btn btn-primary px-4 fw-semibold" id="btn-submit">
                <i class="bi bi-send me-1"></i>${isEdit ? 'Lưu thay đổi' : 'Đăng bài viết'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-cancel')?.addEventListener('click', () => {
    navigate('#my-blogs');
  });

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
      console.error('Failed to load blog for editing:', e);
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
    submitBtn.textContent = 'Đang xử lý...';

    try {
      let finalImageUrl = existingImageUrl;
      const file = fileInput.files[0];

      if (file) {
        submitBtn.textContent = 'Đang tải ảnh lên SeaweedFS...';
        const uploadRes = await uploadFile(file);
        if (uploadRes.url) {
          finalImageUrl = uploadRes.url;
        } else if (uploadRes.error) {
          throw new Error('Lỗi upload ảnh: ' + uploadRes.error);
        }
      }

      submitBtn.textContent = isEdit ? 'Đang cập nhật bài...' : 'Đang lưu bài...';

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
        throw new Error(err.error || 'Lưu bài thất bại.');
      }

      navigate('#my-blogs');

    } catch (err) {
      errEl.textContent = err.message || 'Có lỗi xảy ra.';
      errEl.classList.remove('d-none');
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Lưu thay đổi' : 'Đăng bài viết';
    }
  });
}
