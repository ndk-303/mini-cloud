# PROJECT CONTEXT: MINICLOUD

> **Mô tả ngắn gọn:** Hệ thống mô phỏng nền tảng Điện toán Đám mây (MiniCloud) gồm 9 dịch vụ (11 Docker containers) và Cổng thông tin Sinh viên đa trang (Multi-Page Swiss Modernist) tích hợp cân bằng tải Round-Robin, định danh Keycloak OIDC (RBAC), CSDL MariaDB, lưu trữ S3 SeaweedFS, giám sát Prometheus/Grafana và CI/CD lên AWS EC2.

---

## 1. TỔNG QUAN HẠ TẦNG & 9 MÁY CHỦ CHUYÊN DỤNG

* **Mạng nội bộ:** Docker bridge `cloud-net` (`172.18.0.0/16`).
* **Cổng vào duy nhất (Ingress):** Port **80** của `api-gateway-proxy-server`. Các cổng host khác chỉ phục vụ debug/quản trị.

| STT | Container Name | Image / Tech | Host:Container Port | Vai trò & Điểm nổi bật |
|:---:|---|---|:---:|---|
| **1a** | `web-frontend-server1` | Custom (`web/Dockerfile`, Nginx) | `8001:80` | Web Node 1; giao diện Multi-Page HTML/CSS/JS; live volume mount `./web/html`. |
| **1b** | `web-frontend-server2` | Custom (`web/Dockerfile`, Nginx) | `8002:80` | Web Node 2; tham gia cân bằng tải Round-Robin 1:1 với Node 1. |
| **2** | `application-backend-server` | Custom (`app/Dockerfile`, Python 3.11 Flask) | `8081:8081` | REST API nghiệp vụ; middleware xác thực OIDC JWT; kết nối MariaDB & S3 Boto3. |
| **3** | `relational-database-server` | `mariadb:11` | `3306:3306` | CSDL quan hệ: `minicloud` (notes) và `studentdb` (students, blogs); auto-init SQL. |
| **4** | `authentication-identity-server` | `keycloak:latest` (Quarkus) | `8080:8080` | Máy chủ IdP OIDC; cấp phát JWT RS256; quản lý Realm `master`, Client `flask-app`. |
| **5** | `object-storage-server` | `seaweedfs:latest` (S3) | `9000:9000`<br>`9001:9001` | S3 API (:9000) và Web UI (:9001); thay MinIO giúp tiết kiệm 80% RAM (~40MB). |
| **6** | `internal-dns-server` | `bind9:9.18` | `1053:53/udp` | Phân giải tên miền nội bộ zone `cloud.local` cho các dịch vụ. |
| **7a**| `monitoring-node-exporter-server` | `node-exporter:latest` | `9100:9100` | Thu thập chỉ số tài nguyên host (CPU, RAM, Disk, Network). |
| **7b**| `monitoring-prometheus-server` | `prometheus:latest` | `9090:9090` | Time-series DB; định kỳ scrape metrics từ Node Exporter (:9100) và Web nodes (:80). |
| **8** | `monitoring-grafana-dashboard-server` | `grafana:latest` | `3000:3000` | Dashboard trực quan hóa; auto-provisioning Prometheus datasource. |
| **9** | `api-gateway-proxy-server` | Custom (`proxy/Dockerfile`, Nginx) | `80:80` | Reverse Proxy tiếp nhận traffic duy nhất, định tuyến và cân bằng tải Round-Robin. |

---

## 2. QUY HOẠCH ĐỊNH TUYẾN TẠI API GATEWAY (PORT 80)

```
Yêu cầu Client: http://localhost (Port 80)
  ├── /                  ──► Upstream "web_backend" (Round-Robin 1:1 sang web1:80 & web2:80)
  ├── /students.html     ──► Trang Quản lý Sinh viên & Live API Tester (hỗ trợ cả clean URL /students)
  ├── /tools.html        ──► Trang Công cụ & Giám sát 9 máy chủ (hỗ trợ cả clean URL /tools)
  ├── /blog/blog*.html   ──► Phục vụ trực tiếp các bài viết chuyên đề tĩnh (blog1, blog2, blog3)
  ├── /blog/ (hoặc /blog)──► HTTP 301 Redirect về Trang Chủ (/)
  ├── /api/*             ──► Forward sang application-backend-server:8081/* (strip /api/)
  ├── = /student         ──► Forward sang application-backend-server:8081/student (Exact match)
  ├── = /student/        ──► Forward sang application-backend-server:8081/student/
  └── /auth/*            ──► Forward sang authentication-identity-server:8080/* (Keycloak OIDC)
```

---

## 3. CƠ SỞ DỮ LIỆU & LƯU TRỮ

### 3.1. MariaDB Schemas (`db/init/`)
* **Database `minicloud`** (`001_init.sql`):
  * Bảng `notes (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(100), created_at TIMESTAMP)`.
* **Database `studentdb`** (`002_studentdb.sql`):
  * Bảng `students (id INT PK AUTO_INCREMENT, student_id VARCHAR(10) UNIQUE, fullname VARCHAR(100), dob DATE, major VARCHAR(50))`: Nạp sẵn 5 sinh viên `SV001` - `SV005`.
  * Bảng `blogs (id INT PK AUTO_INCREMENT, title VARCHAR(200), content TEXT, author_id VARCHAR(50), image_url VARCHAR(500), created_at TIMESTAMP)`: Nạp sẵn 3 bài viết chuyên đề kèm ảnh.

### 3.2. S3 Object Storage (SeaweedFS)
* Cổng API: `http://localhost:9000` | Web Console: `http://localhost:9001/ui/index.html`.
* Buckets: `blog-images` (ảnh bài viết), `profile-pics` (avatar), `documents` (PDF).
* Volume lưu trữ bền vững: `./storage/data:/data`.

---

## 4. BẢO MẬT, ĐỊNH DANH & PHÂN QUYỀN (KEYCLOAK RBAC)

* **Cơ chế:** OIDC Direct Access Grants (Resource Owner Password Credentials).
* **Token:** JSON Web Token (JWT) ký số thuật toán bất đối xứng RS256.
* **Backend Validation:** Flask gọi JWKS endpoint `/.well-known/openid-configuration` (cache 10 phút) để verify chữ ký, trích xuất roles mà không cần lưu session.
* **Phân quyền 2 Tầng:**
  * **Role `admin`** (Tài khoản `admin` / `admin`): Toàn quyền thêm, sửa, xóa sinh viên trong CSDL MariaDB; duyệt/xóa mọi bài blog.
  * **Role `student`** (Tài khoản `SV001` - `SV005` / `student123`): Xem danh sách, tạo bài blog, chỉ được sửa/xóa bài do chính mình tạo (`author_id == preferred_username`).
  * **Khách:** Xem công khai bài viết và danh sách sinh viên qua `/student/`.

---

## 5. CẤU TRÚC GIAO DIỆN WEB (MULTI-PAGE SWISS MODERNIST)

* **Phong cách:** Swiss Modernist Editorial (Font: `Newsreader` cho tiêu đề, `Albert Sans` cho giao diện, `JetBrains Mono` cho kỹ thuật; nền giấy ấm `#FAF9F5`, mực đen `#141413`).
* **Các trang độc lập:**
  1. [`web/html/index.html`](file:///D:/Khoa%2015/TON%20DUC%20THANG/Cloud/web/html/index.html) &mdash; **Trang Chủ:** Chỉ tập trung hiển thị Lead Story & danh mục bài viết Blog chuyên đề.
  2. [`web/html/students.html`](file:///D:/Khoa%2015/TON%20DUC%20THANG/Cloud/web/html/students.html) &mdash; **Quản Lý Sinh Viên:** Bảng dữ liệu MariaDB, Live API Tester (`/student/` và `/api/students-db`), Modal thêm sinh viên (Admin only).
  3. [`web/html/tools.html`](file:///D:/Khoa%2015/TON%20DUC%20THANG/Cloud/web/html/tools.html) &mdash; **Công Cụ & Giám Sát:** Thẻ 9 cụm máy chủ, công cụ đo độ trễ Ping `/api/hello`, kiểm thử 4 request Round-Robin luân phiên, kiểm tra Keycloak OIDC.
  4. [`web/html/blog/`](file:///D:/Khoa%2015/TON%20DUC%20THANG/Cloud/web/html/blog/) &mdash; Các bài viết chuyên đề tĩnh (`blog1.html`, `blog2.html`, `blog3.html`).
* **Hot-Reload:** Cấu hình volume `./web/html:/usr/share/nginx/html:ro` giúp sửa HTML/JS/CSS cập nhật tức thì khi F5, không cần rebuild image.

---

## 6. DANH SÁCH REST API ENDPOINTS

| Route | Method | Auth / Role | Mục đích |
|---|:---:|:---:|---|
| `/api/hello` | GET | Public | Healthcheck backend Flask. |
| `/student` hoặc `/student/` | GET | Public | Danh sách sinh viên từ file tĩnh `students.json` (Mở rộng 2 & 9). |
| `/api/students-db` | GET | Public / Admin | Danh sách toàn bộ sinh viên từ bảng `students` trong MariaDB. |
| `/api/students-db` | POST | Role `admin` | Thêm sinh viên mới vào MariaDB (Yêu cầu Bearer Token). |
| `/api/students-db/<id>` | DELETE | Role `admin` | Xóa sinh viên khỏi MariaDB theo ID. |
| `/api/blogs` | GET | Public | Danh sách bài viết blog từ MariaDB (sắp xếp mới nhất). |
| `/api/blogs` | POST | Đã đăng nhập | Đăng bài blog mới; Backend tự gán `author_id`. |
| `/api/upload` | POST | Đã đăng nhập | Upload multipart file ảnh lên SeaweedFS S3. |

---

## 7. TỐI ƯU HÓA TÀI NGUYÊN TRÊN AWS EC2 1GB RAM

Hệ thống được tối ưu đặc biệt để chạy mượt 11 containers trên máy chủ **AWS EC2 t2.micro (1 vCPU, 1GB RAM)**:
1. **SeaweedFS thay MinIO:** Tiết kiệm ~200MB RAM (chỉ dùng ~40MB RAM).
2. **Kìm hãm JVM Keycloak Quarkus:** `-Xms64m -Xmx256m -XX:MetaspaceSize=96M -XX:MaxMetaspaceSize=192m`.
3. **Kìm hãm MariaDB:** `performance_schema=OFF`, `innodb_buffer_pool_size=64M`, `max_connections=20`.
4. **Giới hạn cứng Docker (`deploy.resources.limits.memory`):** Web (48M x 2), App (96M), DB (180M), Keycloak (512M), SeaweedFS (64M), Bind9 (48M), Node Exporter (32M), Prometheus (112M), Grafana (112M), Proxy (48M) -> Tổng trần: 1296M.
5. **Linux Swap Space:** Tạo swap file 2GB trên Ubuntu EC2 làm bộ nhớ đệm chống lỗi OOM.

---

## 8. TỰ ĐỘNG HÓA CI (BUILD & PUSH DOCKER HUB) (.github/workflows/deploy.yml)

Kích hoạt khi push commit lên nhánh `main` hoặc chạy thủ công (`workflow_dispatch`):
1. **Build & Push Docker Hub:** Build tự động 3 custom images trên GitHub runner và push lên Docker Hub:
   * `${DOCKERHUB_USERNAME}/minicloud-web:latest`
   * `${DOCKERHUB_USERNAME}/minicloud-app:latest`
   * `${DOCKERHUB_USERNAME}/minicloud-proxy:latest`
2. **Triển khai thủ công trên EC2:**
   * Sau khi CI build xong, trên máy chủ EC2 chỉ cần chạy:
     ```bash
     docker compose pull && docker compose up -d --remove-orphans
     ```

---

## 9. LỆNH VẬN HÀNH & KIỂM THỬ NHANH

```bash
# Khởi động toàn bộ hệ thống
docker compose up -d --build

# Kiểm tra trạng thái 11 container
docker compose ps

# Kiểm thử Round-Robin load balancing (Header X-Served-By luân phiên giữa 2 web node)
curl.exe -I http://localhost/
curl.exe -I http://localhost/

# Kiểm thử API sinh viên
curl.exe -s http://localhost/student/
curl.exe -s http://localhost/api/students-db

# Kiểm thử phân giải DNS Bind9
nslookup -port=1053 web-frontend-server.cloud.local 127.0.0.1
```
