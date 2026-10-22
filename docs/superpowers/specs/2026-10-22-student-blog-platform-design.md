# Student Blog Platform – Design Spec
**Date:** 2026-10-22  
**Status:** Approved by stakeholder  
**Scope:** Nâng cấp hệ thống MyMiniCloud hiện tại thành Web App Blog Sinh Viên có phân quyền 2 tầng (Admin / Student).

---

## 1. Bối cảnh & Mục tiêu

### 1.1 Hiện trạng
Hệ thống **MyMiniCloud** hiện là một cụm 9 container Docker với:
- **Web Frontend (x2):** Nginx phân phối HTML tĩnh, cân bằng tải Round-Robin.
- **Application Backend:** Flask API (`app.py`) với các endpoint sinh viên (`/student`, `/students-db` CRUD).
- **MariaDB:** Database `studentdb` có bảng `students` (5 bản ghi mẫu).
- **Keycloak:** Identity Provider (`authentication-identity-server`), tích hợp JWT RS256.
- **SeaweedFS S3:** Object storage (`object-storage-server`).
- **Nginx Reverse Proxy:** API Gateway điều phối lưu lượng tới tất cả dịch vụ.
- **Monitoring:** Prometheus + Grafana + Node Exporter.
- **DNS:** Bind9 nội bộ.

### 1.2 Mục tiêu
Chuyển đổi hệ thống thành một **Student Blog Platform hoàn chỉnh** với:
1. Phân quyền 2 nhóm người dùng rõ ràng: **Admin** và **Sinh viên**.
2. Tính năng Blog đầy đủ: tạo, đọc, sửa, xóa bài viết với hỗ trợ ảnh đính kèm.
3. Giao diện Web App hiện đại, tương tác, chạy hoàn toàn trên Nginx tĩnh hiện có.
4. **Bảo toàn** toàn bộ hạ tầng 9 container và các API sinh viên hiện có.

### 1.3 Định nghĩa thành công
- Admin đăng nhập và quản lý (thêm/sửa/xóa) danh sách sinh viên qua giao diện.
- Sinh viên đăng nhập, viết bài blog mới có ảnh minh họa, chỉnh sửa/xóa bài của mình.
- Khách (chưa đăng nhập) có thể đọc tất cả bài blog.
- Mọi API protected đều từ chối request thiếu JWT hoặc sai role.

---

## 2. Kiến trúc Tổng thể

```
Người dùng (Browser)
        │
        ▼
┌──────────────────────────────────────────┐
│  Nginx Reverse Proxy :80                 │  ← api-gateway-proxy-server (hiện có)
│  /           → web_backend (Round-Robin) │
│  /api/*      → Flask :8081              │
│  /auth/*     → Keycloak :8080           │
└──────────────────────────────────────────┘
        │              │              │
        ▼              ▼              ▼
  Web Nginx x2    Flask App      Keycloak
  (HTML/JS/CSS)   (app.py)    (JWT Provider)
                      │
             ┌────────┴────────┐
             ▼                 ▼
          MariaDB          SeaweedFS S3
       (students, blogs)   (images)
```

### 2.1 Luồng Xác thực (Direct Access Grant)
```
1. Browser → POST /auth/realms/master/protocol/openid-connect/token
             body: grant_type=password, client_id=flask-app,
                   username=SV001, password=student123
2. Keycloak → Access Token (JWT RS256) chứa:
              preferred_username: "SV001"
              realm_access.roles: ["student"]
3. Browser → lưu token vào sessionStorage
4. Browser → mọi request protected kèm header: Authorization: Bearer <token>
5. Flask   → giải mã JWT bằng Keycloak JWKS, kiểm tra role, xử lý request
```

---

## 3. Cơ sở Dữ liệu

### 3.1 Giữ nguyên: Bảng `students` (database `studentdb`)
```sql
-- Không thay đổi schema hiện tại
CREATE TABLE IF NOT EXISTS students (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  student_id VARCHAR(10),
  fullname   VARCHAR(100),
  dob        DATE,
  major      VARCHAR(50)
);
```

### 3.2 Mới: Bảng `blogs` (database `studentdb`)
```sql
CREATE TABLE IF NOT EXISTS blogs (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  title      VARCHAR(200) NOT NULL,
  content    TEXT         NOT NULL,
  author_id  VARCHAR(10)  NOT NULL,   -- khớp students.student_id
  image_url  VARCHAR(500),            -- URL ảnh trên SeaweedFS S3
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
  INDEX idx_author (author_id)
);
```

### 3.3 Migration
Thêm file `db/init/003_blogs.sql` để tạo bảng `blogs` và insert dữ liệu mẫu.  
> **Lưu ý:** MariaDB chỉ chạy init scripts khi volume data chưa tồn tại. Với môi trường hiện tại, cần chạy migration thủ công hoặc reset volume.

---

## 4. Backend API (Flask)

### 4.1 Giữ nguyên (không thay đổi)
| Endpoint | Method | Mô tả |
|---|---|---|
| `/hello` | GET | Health check |
| `/secure` | GET | JWT validation demo |
| `/student` | GET | Danh sách SV từ JSON file |
| `/students-db` | GET | Danh sách SV từ MariaDB |
| `/students-db/<id>` | GET | Chi tiết SV |
| `/students-db/<id>` | PUT | Cập nhật SV |
| `/students-db/<id>` | DELETE | Xóa SV |

### 4.2 Thêm mới vào API hiện có
| Endpoint | Method | Mô tả |
|---|---|---|
| `/students-db` | POST | Thêm SV mới (mới, cần bổ sung) |

### 4.3 API Blog (mới hoàn toàn)
| Endpoint | Method | Auth | Mô tả |
|---|---|---|---|
| `/blogs` | GET | Public | Lấy tất cả blog (có phân trang, sắp xếp mới nhất) |
| `/blogs/<id>` | GET | Public | Chi tiết 1 bài blog |
| `/blogs` | POST | `student` hoặc `admin` | Tạo bài blog mới |
| `/blogs/<id>` | PUT | Chủ bài hoặc `admin` | Sửa bài blog |
| `/blogs/<id>` | DELETE | Chủ bài hoặc `admin` | Xóa bài blog |
| `/upload` | POST | `student` hoặc `admin` | Upload ảnh lên SeaweedFS S3, trả về URL |

### 4.4 Middleware Phân quyền
```python
# Hai decorator sẽ được viết mới trong app.py

@require_role("admin")
def endpoint(): ...
# → Kiểm tra JWT hợp lệ + realm_access.roles contains "admin"
# → Trả 401 nếu thiếu token, 403 nếu sai role

@require_auth  
def endpoint(): ...  
# → Chỉ kiểm tra JWT hợp lệ, bất kể role
# → Dùng cho các route blog: logic owner check nằm trong handler
```

### 4.5 Bảo mật CORS
Flask bổ sung header `Access-Control-Allow-Origin: *` cho phép Web Frontend SPA gọi API qua Proxy.

---

## 5. Keycloak Configuration

### 5.1 Client Setup (thực hiện thủ công 1 lần qua Admin Console)
- **Realm:** `master` (đã có)
- **Client ID:** `flask-app`
- **Access Type:** `public`
- **Direct Access Grants Enabled:** `true`
- **Valid Redirect URIs:** `http://localhost/*`, `http://127.0.0.1/*`

### 5.2 Roles
| Role | Mô tả |
|---|---|
| `admin` | Quản trị viên toàn hệ thống |
| `student` | Sinh viên thông thường |

### 5.3 Tài khoản mẫu
| Username | Password | Role | Ghi chú |
|---|---|---|---|
| `admin` | `admin` | `admin` | Tài khoản admin mặc định Keycloak |
| `SV001` | `student123` | `student` | Khớp với students.student_id |
| `SV002` | `student123` | `student` | |
| `SV003` | `student123` | `student` | |
| `SV004` | `student123` | `student` | |
| `SV005` | `student123` | `student` | |

---

## 6. Web Frontend

### 6.1 Stack
- **HTML5** + **Bootstrap 5.3** (via CDN) + **Vanilla JavaScript ES6**
- Không cần build tool, không cần Node.js — file tĩnh phân phối qua Nginx hiện tại.

### 6.2 Cấu trúc File
```
web/html/
├── index.html          ← Shell chính: Navbar, container nội dung, login modal
├── app.js              ← SPA Router, Auth State Management, Navbar logic
├── api.js              ← HTTP client wrapper cho /api/* và /auth/*
└── pages/
    ├── home.js         ← Danh sách blog (public)
    ├── blog-detail.js  ← Chi tiết bài viết (public)
    ├── blog-form.js    ← Form tạo/sửa blog
    ├── my-blogs.js     ← Quản lý blog cá nhân
    └── admin.js        ← Quản lý sinh viên (admin only)
```

### 6.3 Màn hình & Quyền truy cập

| Màn hình | Route (hash) | Ai xem được | Chức năng chính |
|---|---|---|---|
| 🏠 Blog Chính | `#home` (mặc định) | Tất cả | Card list bài blog, nút "Viết bài" khi đã đăng nhập |
| 📖 Chi tiết Blog | `#blog/:id` | Tất cả | Đọc full bài, nút Sửa/Xóa cho chủ bài & admin |
| ✍️ Viết/Sửa Blog | `#blog-form` / `#blog-form/:id` | Student + Admin | Form tiêu đề, nội dung, upload ảnh |
| 📋 Blog của tôi | `#my-blogs` | Student + Admin | Bảng bài viết cá nhân, nút Sửa/Xóa |
| 👨‍💼 Quản lý SV | `#admin` | Admin only | Bảng sinh viên đầy đủ, CRUD inline |

### 6.4 Navbar Responsive theo Role
```
[Khách]    : Logo | Blog ─────────────────── [Đăng nhập]
[Student]  : Logo | Blog | Blog của tôi ──── [SV001] [Đăng xuất]
[Admin]    : Logo | Blog | Blog của tôi | Quản lý SV ─ [admin] [Đăng xuất]
```

### 6.5 Login Modal Flow
```
[Đăng nhập] click
  → Bootstrap Modal hiện ra
  → Nhập username + password
  → POST /auth/realms/master/protocol/openid-connect/token
  → Nhận JWT → atob(token.split('.')[1]) để decode payload
  → Lưu { token, username, role } vào sessionStorage
  → Đóng modal → cập nhật Navbar → navigate về trang phù hợp
  → Hiện lỗi nếu Keycloak trả 401
```

### 6.6 Image Upload Flow
```
User chọn file ảnh trong form blog
  → JavaScript FileReader → Preview ảnh ngay trên form
  → Khi Submit: POST /api/upload với multipart/form-data kèm Bearer token
  → Flask upload lên SeaweedFS S3, trả về { url: "http://..." }
  → URL được lưu vào field image_url khi POST /api/blogs
```

---

## 7. Thay đổi Infrastructure

### 7.1 Nginx Reverse Proxy (`proxy/nginx.conf`)
Bổ sung thêm location cho upload (không strip prefix):
```nginx
# Không thay đổi các location hiện tại
# Thêm mới: proxy cho /api/blogs và /api/upload (đã covered bởi /api/ hiện có)
# → Không cần sửa nginx.conf nếu /api/ đã proxy toàn bộ sang Flask
```
Kiểm tra lại: location `/api/` hiện tại đã đủ để cover tất cả endpoint mới.

### 7.2 Nginx Web Frontend (`web/conf.default`)
Cần đảm bảo Nginx phục vụ được cấu trúc thư mục mới (`pages/`).  
Không cần thay đổi cấu hình nếu root vẫn là `/usr/share/nginx/html`.

### 7.3 Docker Compose
Không thêm container mới. Không thay đổi cấu hình hiện tại.

---

## 8. Testing Plan

| Test | Cách kiểm tra |
|---|---|
| Public blog access | Mở `http://localhost` không đăng nhập → thấy danh sách blog |
| Student login | Đăng nhập `SV001/student123` → Navbar hiện "Blog của tôi" |
| Admin login | Đăng nhập `admin/admin` → Navbar hiện "Quản lý SV" |
| Create blog | Sinh viên tạo bài, chọn ảnh → bài xuất hiện trên trang chính |
| Image upload | Ảnh upload thành công → URL trỏ về SeaweedFS, hiển thị trong bài |
| Role guard | Sinh viên gọi `GET /api/students-db` → nhận 403 |
| Owner guard | SV001 thử sửa bài của SV002 → nhận 403 |
| Admin override | Admin sửa bất kỳ bài blog nào → thành công |
| Student CRUD | Admin thêm sinh viên mới qua UI → xuất hiện trong DB |

---

## 9. Phạm vi Ngoài (Out of Scope)
- Tính năng comment / like bài viết.
- Tìm kiếm / lọc bài viết nâng cao.
- Keycloak tự động provision users (cần tạo thủ công).
- HTTPS / TLS termination.
- Pagination server-side (dùng client-side pagination đơn giản cho V1).
