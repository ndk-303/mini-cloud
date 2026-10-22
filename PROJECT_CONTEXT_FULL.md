# BẢN ĐẶC TẢ NGỮ CẢNH TOÀN DIỆN HỆ THỐNG MYMINICLOUD & STUDENT BLOG PLATFORM
*(Dành cho AI Agent / Kỹ sư viết Báo cáo Cuối kỳ môn Điện toán đám mây - Đại học Tôn Đức Thắng)*

---

## 1. THÔNG TIN CHUNG DỰ ÁN
* **Tên đồ án:** Hệ thống Mô phỏng Nền tảng Điện toán Đám mây (MyMiniCloud) & Diễn đàn Blog Sinh viên Phân quyền 2 Tầng (Student Blog Platform).
* **Đơn vị đào tạo:** Đại học Tôn Đức Thắng (TDTU) – Khoa Công nghệ Thông tin.
* **Môn học:** Điện toán Đám mây (Cloud Computing).
* **Mục tiêu cốt lõi:**
  1. Xây dựng và vận hành một cụm hạ tầng đám mây thu nhỏ gồm **9 loại máy chủ cơ bản** (tổng cộng 11 container Docker), mô phỏng đầy đủ các phân hệ của các Cloud Providers hàng đầu (AWS, Azure, GCP).
  2. Nâng cấp hệ thống thành một **Web App hoàn chỉnh mang tính thực tiễn cao**: Nền tảng Blog Chuyên san Sinh viên (Student Blog Platform) với phân quyền người dùng (Role-Based Access Control - RBAC) 2 nhóm: **Quản trị viên (Admin)** và **Sinh viên (Student)**.
  3. Áp dụng ngôn ngữ thiết kế giao diện **Swiss Modernist / Editorial Magazine** (lấy cảm hứng từ theme WordPress *Modernist*), loại bỏ triệt để các dấu vết template generic ("AI slop").
  4. Đạt chuẩn triển khai Cloud-Native: Cân bằng tải (Load Balancing), Giám sát (Monitoring/Prometheus/Grafana), Lưu trữ đối tượng (S3 Object Storage), Định danh tập trung (Keycloak OIDC), Tự động hóa CI/CD (GitHub Actions), và Kỹ thuật tối ưu hóa bộ nhớ cho máy chủ thực tế **VPS AWS EC2 1GB RAM**.

---

## 2. KIẾN TRÚC TỔNG THỂ & HẠ TẦNG 9 CỤM MÁY CHỦ (9 SERVERS)

### 2.1. Sơ đồ khối kiến trúc (Architecture Diagram)
```text
                             [ NGƯỜI DÙNG / TRÌNH DUYỆT ]
                                           │
                                           │ HTTP:80
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│               9. API GATEWAY / REVERSE PROXY (api-gateway-proxy-server)                │
│                        Nginx 1.30 · Cân bằng tải & Định tuyến                         │
└──────────────┬───────────────────────────┬───────────────────────────┬─────────────────┘
               │                           │                           │
     Route: / (Round-Robin)          Route: /api/               Route: /auth/
               │                           │                           │
               ▼                           ▼                           ▼
┌──────────────────────────────┐ ┌───────────────────────────┐ ┌────────────────────────┐
│ 1. CỤM WEB FRONTEND (x2)     │ │ 2. APPLICATION BACKEND    │ │ 4. ĐỊNH DANH KEYCLOAK  │
│ • web-frontend-server1 (:80) │ │ (application-backend-     │ │ (authentication-       │
│ • web-frontend-server2 (:80) │ │  server)                  │ │  identity-server)      │
│ Nginx · Single Page App SPA  │ │ Python 3.11 · Flask REST  │ │ Keycloak 26 (Quarkus)  │
│ Swiss Modernist Typography   │ │ Boto3 S3 · Jose JWT Auth  │ │ OIDC Provider & Roles  │
│ Direct Ports: 8001 / 8002    │ │ Port: 8081:8081 (1:1)     │ │ Port: 8080:8080 (1:1)  │
└──────────────────────────────┘ └─────────────┬─────────────┘ └────────────────────────┘
                                               │
                                 ┌─────────────┴─────────────┐
                                 ▼                           ▼
                   ┌──────────────────────────┐ ┌──────────────────────────┐
                   │ 3. CƠ SỞ DỮ LIỆU MARIADB │ │ 5. OBJECT STORAGE (S3)   │
                   │ (relational-database-    │ │ (object-storage-server)  │
                   │  server)                 │ │ SeaweedFS S3 Server      │
                   │ MariaDB 11 · studentdb   │ │ Bucket: blog-images      │
                   │ Bảng students & blogs    │ │ Port: 9000 (S3 API)      │
                   │ Port: 3306:3306          │ │       9001 (Web UI)      │
                   └──────────────────────────┘ └──────────────────────────┘
                                 │
     ┌───────────────────────────┴───────────────────────────┐
     ▼                                                       ▼
┌──────────────────────────────┐               ┌──────────────────────────┐
│ 6. HỆ THỐNG GIÁM SÁT         │               │ 7. PHÂN GIẢI TÊN MIỀN    │
│ • 7a. Node Exporter (:9100)  │               │    INTERNAL DNS          │
│ • 7b. Prometheus (:9090)     │               │ (internal-dns-server)    │
│ • 8. Grafana (:3000)         │               │ Bind9 9.18 Zone:         │
│   Dashboard giám sát tải     │               │ cloud.local              │
└──────────────────────────────┘               └──────────────────────────┘
```

### 2.2. Bảng quy hoạch 9 Máy chủ & Thông số kỹ thuật

| STT | Tên Service Container | Loại Image | Công nghệ sử dụng | Port Host:Container | Chức năng & Vai trò trong hệ thống |
|:---:|:---|:---:|:---|:---:|:---|
| **1a** | `web-frontend-server1` | Custom (Dockerfile) | Nginx Stable Alpine | `8001:80` | Nút chính (Node 1) cụm Web Frontend; phục vụ SPA Blog Sinh Viên, tích hợp Live Volume Mount. |
| **1b** | `web-frontend-server2` | Custom (Dockerfile) | Nginx Stable Alpine | `8002:80` | Nút phụ (Node 2) cụm Web Frontend; tham gia cân bằng tải Round-Robin. |
| **2** | `application-backend-server` | Custom (Dockerfile) | Python 3.11 Alpine / Flask | `8081:8081` | REST API xử lý nghiệp vụ; middleware JWT Keycloak; quản lý MariaDB & upload ảnh SeaweedFS S3. |
| **3** | `relational-database-server` | Official | MariaDB 11 | `3306:3306` | Lưu trữ dữ liệu quan hệ (Database `studentdb` chứa 2 bảng `students` và `blogs`). |
| **4** | `authentication-identity-server` | Official | Keycloak 26 (Quarkus) | `8080:8080` | Máy chủ chứng thực SSO, quản lý danh tính OIDC, cấp phát JWT token, phân quyền `admin` & `student`. |
| **5** | `object-storage-server` | Official | SeaweedFS Latest | `9000:9000`<br>`9001:9001` | Lưu trữ đối tượng S3 tương thích AWS; lưu file ảnh bài viết blog (thay thế MinIO giúp tiết kiệm 70% RAM). |
| **6** | `internal-dns-server` | Official | ISC Bind9 9.18 | `1053:53/udp` | Máy chủ DNS nội bộ, phân giải các tên miền `*.cloud.local`. |
| **7a**| `monitoring-node-exporter-server` | Official | Prom Node Exporter | `9100:9100` | Agent thu thập chỉ số phần cứng (CPU, RAM, Disk, Network) của máy chủ host. |
| **7b**| `monitoring-prometheus-server` | Official | Prometheus Latest | `9090:9090` | Thu thập metrics định kỳ (scrape) từ Node Exporter và Nginx, lưu trữ chuỗi thời gian (TSDB). |
| **8** | `monitoring-grafana-dashboard-server` | Official | Grafana Latest | `3000:3000` | Bảng điều khiển trực quan hóa metrics; tự động nạp cấu hình (Auto-provisioning) Prometheus Datasource. |
| **9** | `api-gateway-proxy-server` | Custom (Dockerfile) | Nginx Gateway | `80:80` | Cổng vào duy nhất; Reverse Proxy điều phối lưu lượng; cân bằng tải Round-Robin giữa 2 Frontend. |

---

## 3. THIẾT KẾ DỮ LIỆU (DATABASE SCHEMA & S3 STORAGE)

Database: **`studentdb`** trên MariaDB (`relational-database-server`).

### 3.1. Bảng `students` (Dữ liệu Sinh viên - Giữ nguyên hiện trạng & mở rộng CRUD)
```sql
CREATE TABLE IF NOT EXISTS students (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  student_id VARCHAR(10) UNIQUE NOT NULL, -- Mã số sinh viên (SV001, SV002,...)
  fullname   VARCHAR(100) NOT NULL,       -- Họ và tên
  dob        DATE,                        -- Ngày sinh
  major      VARCHAR(50)                  -- Chuyên ngành đào tạo
);
```
*Dữ liệu mẫu khởi tạo:* 5 sinh viên từ `SV001` đến `SV005` thuộc các ngành CS, DS, Cyber, AI, SE.

### 3.2. Bảng `blogs` (Dữ liệu Bài viết Chuyên san Sinh viên - Mới)
```sql
CREATE TABLE IF NOT EXISTS blogs (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  title      VARCHAR(200) NOT NULL,       -- Tiêu đề bài viết
  content    TEXT NOT NULL,               -- Toàn văn nội dung bài viết
  author_id  VARCHAR(10) NOT NULL,        -- Khớp với student_id (hoặc admin)
  image_url  VARCHAR(500),                -- Đường dẫn ảnh trên SeaweedFS S3
  created_at DATETIME DEFAULT NOW(),      -- Thời điểm đăng bài
  updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
  INDEX idx_author (author_id)
);
```

### 3.3. Tích hợp Lưu trữ Đối tượng SeaweedFS S3
* **Bucket name:** `blog-images`
* **Quy tắc đặt tên file (Key):** `blog/{random_8hex}_{original_filename}`
* **URL công khai truy cập:** `http://localhost:9000/blog-images/blog/...`
* Khi tạo bài viết kèm file ảnh, Web App gửi file tới backend `/api/upload` ➔ Backend dùng thư viện `boto3` tự động kiểm tra và khởi tạo bucket (nếu chưa có) rồi đẩy file lên SeaweedFS, trả về URL cố định lưu vào trường `image_url` của bảng `blogs`.

---

## 4. CƠ CHẾ BẢO MẬT, ĐỊNH DANH & PHÂN QUYỀN (KEYCLOAK OIDC & JWT)

### 4.1. Mô hình Phân quyền 2 Tầng (Role-Based Access Control)
1. **Quản trị viên (Role: `admin`)**:
   - Tài khoản mẫu: `admin` / mật khẩu `admin`.
   - Toàn quyền gọi các API CRUD sinh viên trên cơ sở dữ liệu (`/api/students-db`).
   - Quyền quản trị tối cao trên phân hệ Blog: Xem, viết bài, và **chỉnh sửa / xóa bất kỳ bài viết nào** của bất kỳ sinh viên nào.
   - Giao diện kích hoạt thêm tab đặc quyền: **Quản lý sinh viên** (`#admin`).
2. **Sinh viên (Role: `student`)**:
   - Tài khoản mẫu: `SV001` đến `SV005` / mật khẩu `student123`.
   - `preferred_username` trong Token khớp chính xác với mã sinh viên `student_id`.
   - Đọc tất cả các bài viết blog từ cộng đồng.
   - Tạo bài viết mới, tự động gán tác giả là chính mình.
   - Quản lý bài viết cá nhân tại tab **Bài viết của tôi** (`#my-blogs`).
   - **Ràng buộc sở hữu (Ownership Guard):** Sinh viên chỉ có quyền sửa hoặc xóa bài viết do chính mình tạo ra (`author_id == preferred_username`). Nếu cố tình can thiệp bài của người khác, backend sẽ chặn với mã lỗi **403 Forbidden**.
   - Bị chặn hoàn toàn khi truy cập các API hoặc trang quản trị sinh viên.
3. **Khách (Chưa đăng nhập)**:
   - Truy cập công khai trang chủ, đọc nội dung tất cả các bài viết blog.
   - Các thao tác viết bài hoặc quản lý đều yêu cầu mở popup đăng nhập.

### 4.2. Luồng xác thực Direct Access Grants (Không rời trang Web)
```text
1. Người dùng nhập MSSV/Password tại popup Đăng nhập.
2. Web App gửi request:
   POST /auth/realms/master/protocol/openid-connect/token
   Body: grant_type=password & client_id=flask-app & username=... & password=...
3. Keycloak xác thực và trả về JWT Access Token (RS256).
4. Web App giải mã payload lưu { token, username, role } vào sessionStorage.
5. Mọi request gọi API cần bảo vệ đều đính kèm Header:
   Authorization: Bearer <access_token>
6. Flask Backend xác thực chữ ký RS256 thông qua Keycloak JWKS endpoint (có bộ nhớ đệm cache 10 phút), kiểm tra roles và quyền sở hữu trước khi thực thi SQL.
```

---

## 5. ĐẶC TẢ CHI TIẾT CÁC ĐIỂM CUỐI REST API (API SPECIFICATION)

| Đường dẫn (Route) | Method | Yêu cầu xác thực / Role | Mục đích & Chi tiết xử lý |
|---|:---:|:---:|---|
| `/api/hello` | GET | Public | Endpoint kiểm tra sức khỏe (Healthcheck) của Flask App. |
| `/api/student` | GET | Public | Đọc dữ liệu sinh viên từ file tĩnh `students.json`. |
| `/api/students-db` | GET | Role `admin` | Lấy danh sách toàn bộ sinh viên từ bảng `students` trong MariaDB. |
| `/api/students-db/<id>` | GET | Role `admin` | Lấy thông tin chi tiết một sinh viên theo ID. |
| `/api/students-db` | POST | Role `admin` | Thêm sinh viên mới. Yêu cầu JSON: `{student_id, fullname, dob, major}`. Kiểm tra trùng MSSV. |
| `/api/students-db/<id>` | PUT | Role `admin` | Cập nhật thông tin sinh viên theo ID. |
| `/api/students-db/<id>` | DELETE | Role `admin` | Xóa sinh viên khỏi cơ sở dữ liệu theo ID. |
| `/api/blogs` | GET | Public | Lấy danh sách bài blog, sắp xếp mới nhất lên đầu (`ORDER BY created_at DESC`). |
| `/api/blogs/<id>` | GET | Public | Lấy chi tiết toàn văn bài blog theo ID. |
| `/api/blogs` | POST | Đã đăng nhập (`student` hoặc `admin`) | Tạo bài viết mới. Payload: `{title, content, image_url?}`. Backend tự động gán `author_id`. |
| `/api/blogs/<id>` | PUT | Chủ bài viết hoặc `admin` | Chỉnh sửa tiêu đề, nội dung, ảnh. Kiểm tra quyền sở hữu. |
| `/api/blogs/<id>` | DELETE | Chủ bài viết hoặc `admin` | Xóa bài viết. Kiểm tra quyền sở hữu. |
| `/api/upload` | POST | Đã đăng nhập | Upload multipart file ảnh lên cụm SeaweedFS S3, trả về `{url: "..."}`. |

---

## 6. THIẾT KẾ GIAO DIỆN WEB FRONTEND (SWISS MODERNIST EDITORIAL)

Trang web được xây dựng theo kiến trúc **Single Page Application (SPA)** viết bằng **Vanilla JavaScript ES6 Modules**, hoạt động trên nền **Nginx** mà không cần qua bước biên dịch Node.js nặng nề:

### 6.1. Triết lý Thiết kế (Nói KHÔNG với "AI Slop")
* **Nguyên tắc Swiss Modernist**: Tối giản, kỷ luật, cấu trúc lưới chặt chẽ, lấy **typography làm kiến trúc chính** của trang web.
* **Bộ phông chữ phối hợp (Typography Pairing)**:
  - **`Newsreader` (Google Serif)**: Dành cho tiêu đề bài viết và các tiêu đề lớn, mang hơi thở học thuật, văn học và báo chí chuyên nghiệp.
  - **`Albert Sans` (Google Sans)**: Lấy cảm hứng từ trường phái Bauhaus & Modernism Bắc Âu, dùng cho thân bài và giao diện, siêu nét, thanh thoát, tránh xa các phông generic bị lạm dụng như Inter hay Roboto.
  - **`JetBrains Mono` (Google Mono)**: Dành cho metadata kỹ thuật, mã số sinh viên, ngày tháng và nhãn phân quyền.
* **Bảng màu & Chất liệu**:
  - Nền giấy ngà ấm áp (Warm Paper): `#FAF9F5` chống mỏi mắt.
  - Màu mực in đậm (Deep Ink): `#141413` tự nhiên.
  - Đường gióng thanh mảnh (Hairline Rules): `1px solid #E5E2DA` phân chia bố cục rõ ràng.
  - Nút bấm tương phản cao (Inverted Black & White) kết hợp điểm nhấn đỏ gạch nung (`#C2410C`), loại bỏ 100% gradient lòe loẹt.

### 6.2. Các phân trang chính (SPA Routes)
1. 🏠 **Trang Chủ Chuyên San (`#home`)**: Bố cục *The Editorial Index* với tiêu đề Chuyên san lớn, hiển thị danh mục bài viết đánh số thứ tự (`01`, `02`...), ngày đăng, tác giả và hình ảnh tỉ lệ điện ảnh phẳng.
2. 📖 **Trang Đọc Chi Tiết (`#blog/:id`)**: Không gian đọc chuẩn mực (Reading room) giới hạn khổ rộng 760px căn giữa, dãn dòng `1.85`, thanh thông tin tác giả và biểu tượng kết thúc colophon (`— HẾT BÀI VIẾT —`).
3. ✍️ **Studio Soạn Thảo (`#blog-form`)**: Giao diện viết bài tĩnh lặng, tập trung, tiêu đề không viền, khung soạn thảo thoáng đãng, khu vực tải ảnh S3 xem trước trực tiếp.
4. 📋 **Bài Viết Của Tôi (`#my-blogs`)**: Sổ cái lưu trữ (Architectural Ledger) hiển thị các bài viết cá nhân kèm các text link thao tác nhanh (`Sửa — Xóa`).
5. 👨‍💼 **Quản Trị Sinh Viên (`#admin`)**: Bảng tra cứu sinh viên tối giản cho Admin, đầy đủ tính năng Thêm/Sửa/Xóa sinh viên trực tiếp trên MariaDB.

### 6.3. Tính năng Live Sync Development (Hot Reload)
- Được cấu hình trực tiếp qua Docker Volume: `./web/html:/usr/share/nginx/html:ro`.
- Lập trình viên chỉ cần chỉnh sửa code HTML/JS/CSS và lưu file, sau đó bấm F5 trên trình duyệt là cập nhật tức thì, **không cần phải chạy `docker compose build` lại**.

---

## 7. CÁC ĐIỂM SÁNG KỸ THUẬT NÂNG CAO (ADVANCED EXTENSIONS ĐẠT ĐIỂM TỐI ĐA)

1. **Cân Bằng Tải & Dự Phòng Cụm (High Availability & Load Balancing - Mở rộng 10)**:
   - Sử dụng Nginx Upstream `web_backend` phân phối yêu cầu theo thuật toán Round-Robin tuần tự qua `web-frontend-server1` và `web-frontend-server2`.
   - Kiểm chứng minh bạch qua response header `X-Served-By: <hostname_container>`.
2. **Kỹ Thuật Tối Ưu Hóa Bộ Nhớ Cực Hạn (VPS AWS EC2 1GB RAM Optimization)**:
   - Thay thế máy chủ lưu trữ MinIO nặng nề (~150MB - 250MB RAM) bằng **SeaweedFS** siêu nhẹ (chỉ tiêu tốn **~30MB - 50MB RAM**).
   - Kìm hãm JVM Keycloak Quarkus: `-Xms64m -Xmx384m -XX:MetaspaceSize=128M -XX:MaxMetaspaceSize=256m` và gỡ bỏ cờ xung đột GC.
   - Kìm hãm MariaDB: `performance_schema=OFF`, `innodb_buffer_pool_size=64M`, `max_connections=20`.
   - Thiết lập trần bộ nhớ cứng (`deploy.resources.limits.memory`) cho toàn bộ 11 container để ngăn chặn hiện tượng Out-Of-Memory (OOM).
   - Thiết lập phân vùng ảo **2GB Swap Memory** trên Linux EC2 làm đệm an toàn.
3. **Tự Động Hóa CI/CD (GitHub Actions Pipeline)**:
   - Tệp `.github/workflows/deploy.yml` tự động kích hoạt khi có commit lên nhánh `main`.
   - Tự động đóng gói và build đồng thời 3 custom images (`web`, `app`, `proxy`) đẩy lên Docker Hub.
   - Tự động SSH vào máy chủ AWS EC2, đồng bộ cấu hình, pull image mới và kích hoạt `docker compose up -d` không gián đoạn dịch vụ.
4. **Hạ Tầng Giám Sát Metrics Thời Gian Thực (Full Observability Stack)**:
   - **Prometheus**: Định kỳ scrape metrics từ Node Exporter (`:9100`), Flask App (`:8081`), và Nginx (`/metrics`).
   - **Grafana**: Tự động liên kết nguồn dữ liệu Prometheus (Datasource Provisioning), trực quan hóa biểu đồ tải hệ thống (CPU, RAM, Lưu lượng mạng).
5. **Máy Chủ DNS Nội Bộ (Bind9)**:
   - Cung cấp phân giải tên miền riêng cho vùng mạng `cloud.local`, cho phép các service trong mạng nội bộ liên lạc với nhau qua tên miền thay vì IP tĩnh.

---

## 8. BẢNG DANH SÁCH TÀI KHOẢN MẪU & MA TRẬN KIỂM THỬ (TEST MATRIX)

### 8.1. Danh sách tài khoản hệ thống

| Nhóm đối tượng | Tên đăng nhập (Username) | Mật khẩu (Password) | Vai trò (Role) | Chức năng được phép |
|---|---|---|---|---|
| **Quản trị viên** | `admin` | `admin` | `admin` | Toàn quyền CRUD sinh viên DB, duyệt/sửa/xóa toàn bộ bài viết blog. |
| **Sinh viên 1** | `SV001` | `student123` | `student` | Viết bài, upload ảnh, sửa/xóa bài của `SV001`. Không được sửa bài khác. |
| **Sinh viên 2** | `SV002` | `student123` | `student` | Tương tự cho sinh viên `SV002`. |
| **Sinh viên 3, 4, 5** | `SV003`, `SV004`, `SV005` | `student123` | `student` | Tương tự cho các sinh viên tiếp theo. |
| **Keycloak Console** | `admin` | `admin` | Keycloak Master Admin | Quản trị Identity Server tại `http://<IP>:8080` (hoặc qua Proxy `http://<IP>/auth/`). |
| **Grafana Dashboard** | `admin` | `admin` | Grafana Admin | Xem Dashboard giám sát tại `http://<IP>:3000`. |
| **MariaDB Root** | `root` | `root` | Database Superuser | Quản lý database `studentdb` trên port `3306`. |

### 8.2. Kịch bản kiểm thử mẫu (Test Cases)

| Mã kiểm thử | Bước thực hiện | Kết quả kỳ vọng |
|---|---|---|
| **TC-01** | Truy cập `http://localhost/` khi chưa đăng nhập. | Hiển thị giao diện Chuyên san Modernist, đọc được 3 bài blog mẫu; nút Đăng nhập hiển thị góc trên. |
| **TC-02** | Gọi `curl -s http://localhost/api/students-db` không có token. | Trả về HTTP **401 Unauthorized**: `{"error": "Missing Bearer token"}`. |
| **TC-03** | Đăng nhập bằng tài khoản `SV001`, sau đó gọi API `/api/students-db`. | Trả về HTTP **403 Forbidden**: `{"error": "Role 'admin' required"}`. |
| **TC-04** | Đăng nhập bằng `admin`, gọi `GET /api/students-db`. | Trả về HTTP **200 OK** kèm danh sách sinh viên từ MariaDB. |
| **TC-05** | `SV001` đăng bài blog mới, upload 1 ảnh minh họa. | Bài đăng thành công (HTTP 201), ảnh được lưu trữ trên S3 SeaweedFS, bài xuất hiện trên trang chủ. |
| **TC-06** | `SV002` đăng nhập và cố tình gửi request xóa bài của `SV001`. | Bị chặn với mã lỗi HTTP **403 Forbidden** do vi phạm quy tắc sở hữu. |
| **TC-07** | `admin` đăng nhập và thực hiện xóa bài của `SV001`. | Xóa thành công (HTTP 200) do `admin` có quyền quản trị tối cao. |
| **TC-08** | Gửi liên tiếp 4 request `curl -I http://localhost/`. | Header `X-Served-By` luân phiên đổi giữa `web-frontend-server1` và `web-frontend-server2`. |
