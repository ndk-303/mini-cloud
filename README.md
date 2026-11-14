# MyMiniCloud – Cloud Simulation Platform

Hệ thống mô phỏng nền tảng điện toán đám mây thu nhỏ (**MyMiniCloud**) gồm **9 loại máy chủ cơ bản**, vận hành bằng Docker Container trong mạng nội bộ `cloud-net`, điều phối qua `docker-compose.yml` và cân bằng tải giữa **2 web node**. GitHub Actions hiện build/push image; EC2 được triển khai thủ công.

---

## 🏗️ Kiến Trúc 9 Servers & Phân Loại Image

| STT | Service Name | Loại Image | Tên Image | Port (Host:Container) | Vai trò |
| :-- | :--- | :--- | :--- | :--- | :--- |
| 1a | `web-frontend-server1` | **Custom (Dockerfile)** | `<user>/minicloud-web:latest` | `8001:80` | Web tĩnh chính & Blog cá nhân (Cluster node 1) |
| 1b | `web-frontend-server2` | **Custom (Dockerfile)** | `<user>/minicloud-web:latest` | `8002:80` | Web tĩnh phụ phục vụ Round-Robin Load Balancing (Cluster node 2) |
| 2 | `application-backend-server` | **Custom (Dockerfile)** | `<user>/minicloud-app:latest` | `8081:8081` | Python Flask REST API & DB Connection |
| 3 | `relational-database-server` | **Official** | `mariadb:11` | `3306:3306` | CSDL quan hệ MariaDB |
| 4 | `authentication-identity-server` | **Official** | `quay.io/keycloak/keycloak:latest` | `8080:8080` | SSO & Identity Keycloak (OIDC Token) |
| 5 | `minio` (alias `object-storage-server`) | **Community source build** | `ghcr.io/intikhab49/minio-from-source:RELEASE.2025-10-15T17-29-55Z` | `9000:9000`, `9001:9001` | Object Storage MinIO (S3 API & Web UI) |
| 6 | `internal-dns-server` | **Official** | `internetsystemsconsortium/bind9:9.18`| `1053:53/udp` | Internal DNS Bind9 (`cloud.local`) |
| 7a | `monitoring-node-exporter-server` | **Official** | `prom/node-exporter:latest` | `9100:9100` | Thu thập metrics tài nguyên Node |
| 7b | `monitoring-prometheus-server` | **Official** | `prom/prometheus:latest` | `9090:9090` | Thu thập & lưu trữ Metrics hệ thống |
| 8 | `monitoring-grafana-dashboard-server`| **Official** | `grafana/grafana:latest` | `3000:3000` | Dashboard trực quan hóa Grafana (Auto-provisioned) |
| 9 | `api-gateway-proxy-server` | **Custom (Dockerfile)** | `<user>/minicloud-proxy:latest` | `80:80` | Nginx Gateway, Routing & Round-Robin Load Balancing |

---

## 📁 Cấu Trúc Thư Mục

```text
.
├── app/                  # Custom Backend Flask API, students.json, setup_keycloak.py (có Dockerfile)
├── auth/                 # Keycloak identity volume (.gitkeep)
├── db/                   # MariaDB init scripts và migration (001–003)
├── dns/                  # Bind9 DNS configs & db.cloud.local zone
├── grafana/              # Grafana dashboards (.gitkeep)
├── monitor/              # Prometheus config (prometheus.yml)
├── proxy/                # Custom Gateway Nginx Dynamic DNS (có Dockerfile)
├── storage/              # MinIO Object Storage volume data
├── web/                  # Custom Web Frontend HTML & 3 Blog posts (có Dockerfile)
├── .github/workflows/    # Pipeline CI/CD tự động (deploy.yml)
├── docker-compose.yml    # File điều phối toàn bộ 9 services
├── .env.example          # Mẫu cấu hình biến môi trường
└── README.md
```

---

## ⚡ Tối Ưu Hóa Bộ Nhớ Cho VPS 1GB RAM (AWS EC2)

Để giảm nguy cơ thiếu RAM khi chạy các service trên máy chủ 1GB RAM:

1. **Tạo 2GB Swap Memory (Bắt buộc chạy trên EC2)**:
   ```bash
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```
2. **Cấu hình kìm hãm tài nguyên trong `docker-compose.yml`**:
   * **Keycloak**: Giới hạn JVM Heap `-Xms64m -Xmx288m` và trần RAM `580M`.
   * **MariaDB**: Tắt `performance_schema=OFF`, đệm `innodb_buffer_pool_size=64M`.
   * **MinIO**: Dùng community image built from MinIO source with a fixed tag and built-in curl healthcheck; giới hạn Compose ở **180M** để phù hợp EC2 1GB có swap.
   * Các service chạy thường trực được thiết lập trần bộ nhớ (`deploy.resources.limits.memory`).

---

## 🔄 Cân bằng tải giữa 2 web node

Compose chạy sẵn `web-frontend-server1` và `web-frontend-server2`. Nginx Proxy phân phối request round robin giữa hai node này. Cấu hình hiện tại chưa hỗ trợ lệnh `--scale` để tăng lên 4 node.

```bash
docker compose up -d --build
docker compose ps -a
# Gọi nhiều lần và xem X-Upstream-Addr thay đổi giữa hai web node
curl -I http://localhost/
curl -I http://localhost/
```

---

## 🚀 Build image bằng GitHub Actions, deploy EC2 thủ công

Mỗi lần `git push origin main`:
1. GitHub Actions build 3 custom images (`web`, `app`, `proxy`) và push lên Docker Hub.
2. Trên EC2, đồng bộ repository cùng `.env`, rồi chạy `docker compose up -d --build`. Workflow hiện chưa tự SSH/deploy lên EC2.

### Cấu hình Secrets trên GitHub Repo:
Vào **Settings** ➔ **Secrets and variables** ➔ **Actions**:
* `DOCKERHUB_USERNAME`: Tên tài khoản Docker Hub.
* `DOCKERHUB_TOKEN`: Personal Access Token trên Docker Hub (quyền *Read & Write*).

---

## 🎓 Student Blog Platform & Phân Quyền 2 Tầng (Role-Based Access Control)

Hệ thống đã được nâng cấp thành **Web App Blog Sinh Viên hoàn chỉnh** với trải nghiệm Single Page Application (Bootstrap 5, Responsive, Hash Routing) phân quyền rõ ràng:

### 1. Phân quyền người dùng (Keycloak OIDC JWT):
* **Admin (`admin` / `admin`)**:
  - Toàn quyền quản lý danh sách sinh viên trực tiếp trên MariaDB (Xem, Thêm, Sửa, Xóa) tại tab **Quản lý Sinh viên** (`#admin`).
  - Toàn quyền quản trị tất cả các bài blog (Sửa, Xóa bất kỳ bài viết nào).
* **Sinh viên (`SV001`–`SV005` / `student123`)**:
  - Đăng nhập trực tiếp bằng MSSV trên giao diện Web App.
  - Đọc tất cả các bài viết blog từ cộng đồng sinh viên.
  - Đăng bài blog của riêng mình với ảnh minh họa tự động lưu trữ lên **MinIO S3 Object Storage**.
  - Quản lý bài viết cá nhân tại tab **Blog của tôi** (`#my-blogs`) - chỉ được sửa/xóa bài của chính mình.
* **Khách (Chưa đăng nhập)**:
  - Xem danh sách bài viết blog công khai và đọc chi tiết bài viết.

### 2. Thiết lập tự động Keycloak:
`docker compose up -d --build` chạy service `keycloak-bootstrap` sau khi Keycloak khởi động. Service này chờ Keycloak sẵn sàng (tối đa khoảng 10 phút), tạo client `flask-app`, role `admin`/`student`, 5 tài khoản sinh viên trong realm `master` và `sv01`/`sv02` trong realm theo MSSV; gateway chỉ khởi động sau khi bước này và migration DB hoàn tất. Xem kết quả bằng:
```bash
docker compose ps -a
docker compose logs keycloak-bootstrap db-schema-migration
```
Hai service setup kết thúc với trạng thái `Exited (0)` là bình thường. Nếu cần chạy lại cấu hình Keycloak, dùng `docker compose run --rm keycloak-bootstrap`.

---

## 🧪 Danh Sách Kiểm Thử Các Dịch Vụ (Endpoints)

| Dịch vụ | Đường dẫn truy cập | Kết quả kiểm thử kỳ vọng |
| :--- | :--- | :--- |
| **Web App (Student Blog)** | `http://<IP_EC2>/` | Giao diện Web App Blog Sinh Viên hoàn chỉnh (SPA, Load-balanced) |
| **Blog API (Public)** | `http://<IP_EC2>/api/blogs` | Danh sách bài blog (JSON) từ MariaDB |
| **Chi tiết blog** | `http://<IP_EC2>/api/blogs/1` | Một bài blog, gồm `created_at` và `updated_at` |
| **Upload Ảnh (S3)** | `POST http://<IP_EC2>/api/upload` | Upload ảnh lên MinIO S3 (Yêu cầu JWT) |
| **Xem ảnh đã upload** | `http://<IP_EC2>/api/uploads/<key>` | Trình duyệt đọc ảnh qua API Gateway; URL này được trả về sau upload |
| **API Hello** | `http://<IP_EC2>/api/hello` | Trả về JSON `{"message": "Hello from App Server!"}` |
| **API Sinh viên (JSON)** | `http://<IP_EC2>/student/` | Danh sách 5 sinh viên từ `students.json` |
| **API Sinh viên (DB CRUD)** | `http://<IP_EC2>/api/students-db` | Quản lý sinh viên trên MariaDB `studentdb` (Yêu cầu Role `admin`) |
| **Keycloak Admin** | `http://<IP_EC2>:8080` | Đăng nhập Admin Console (`admin` / `admin`) hoặc qua Proxy `http://<IP_EC2>/auth/` |
| **MinIO S3 API** | `http://<IP_EC2>:9000` | Cổng API S3 tạo Bucket & Upload File |
| **MinIO Web UI** | `http://<IP_EC2>:9001` | MinIO Console xem bucket và object |
| **Prometheus** | `http://<IP_EC2>:9090` | Quản lý metrics hệ thống, xem trạng thái targets UP |
| **Grafana** | `http://<IP_EC2>:3000` | Dashboard biểu đồ CPU, RAM, Network (`admin` / `admin`) |
| **Internal DNS** | Port UDP `1053` | Phân giải `web-frontend-server.cloud.local` |

## Hướng dẫn chạy và demo đầy đủ trên local (Windows PowerShell)

Chạy các lệnh tại thư mục chứa `docker-compose.yml`. Máy cần có Docker Desktop đang chạy. Không dừng hoặc xóa toàn bộ container trên máy; nếu trùng cổng hoặc `container_name`, chỉ xử lý container gây xung đột.

### Bước 1 — Cấu hình và khởi động

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
```

Thêm vào `.env` (thay MSSV và mật khẩu demo theo ý bạn):

```dotenv
DOCKER_USER=<Docker_Hub_username>
KEYCLOAK_REALM=realm_<MSSV>
SV01_PASSWORD=student123
SV02_PASSWORD=student123
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
```

Mặc định nếu không khai báo `KEYCLOAK_REALM` là `realm_SV001`. MinIO dùng image cộng đồng được build từ mã nguồn MinIO vì image Docker Hub cũ không còn pull được. File `storage/sample-report.pdf` là PDF mẫu nhỏ; thay bằng báo cáo thật trước buổi demo nếu giảng viên yêu cầu.

```powershell
docker compose config --quiet
docker compose up -d --build
docker compose ps -a
docker compose logs --tail=30 keycloak-bootstrap minio-bootstrap db-schema-migration
```

Lần chạy đầu, Keycloak có thể mất vài phút để khởi tạo. Chỉ tiếp tục khi `api-gateway-proxy-server` là `Up` và ba service `keycloak-bootstrap`, `minio-bootstrap`, `db-schema-migration` đều là `Exited (0)`. Nếu một service là `Exited (1)`, đọc log của service đó; sau khi sửa lỗi, chạy lại `docker compose up -d --build`.

### Bước 2 — Demo 10 yêu cầu mặc định

| # | Thao tác | Kết quả cần thấy |
|---|---|---|
| 1. Web | Mở `http://localhost/` và `http://localhost:8001/blog/blog1.html` | Trang chủ và bài blog hiển thị. `/blog/` hiện trả `301` về `/`, chưa đáp ứng ví dụ `200` trong đề. |
| 2. App | `curl.exe http://localhost:8081/hello` và `curl.exe http://localhost/api/hello` | Cả hai trả `{"message":"Hello from App Server!"}`. |
| 3. Database | Chạy lệnh SQL bên dưới với database `minicloud` | Bảng `notes` có dữ liệu. |
| 4. Keycloak | Mở `http://localhost:8080`, đăng nhập `admin/admin` | Admin Console và realm `master` hoạt động. |
| 5. Object storage | Mở `http://localhost:9001`, đăng nhập bằng tài khoản MinIO trong `.env`; tạo bucket `demo`, upload `web/html/index.html` | File xuất hiện và tải lại được. |
| 6. DNS | Chạy lệnh `dig` bên dưới | `web-frontend-server.cloud.local` trả `10.10.10.10`. |
| 7. Prometheus | Mở `http://localhost:9090/targets` | Target node exporter là `UP`. |
| 8. Grafana | Mở `http://localhost:3000`, đăng nhập `admin/admin`, vào System Health | Ba biểu đồ CPU, RAM, network có dữ liệu. Nếu `No data` hoặc lỗi datasource thì chưa đạt. |
| 9. Gateway | Gọi `/`, `/api/hello`, `/auth/` qua cổng 80 | Truy cập được ba tuyến web, app, auth; Keycloak Console có thể mở trực tiếp ở cổng 8080. |
| 10. Mạng Docker | Ping các alias từ container DNS bằng lệnh bên dưới | `web`, `app-server`, `db`, `keycloak`, `minio`, `prometheus`, `grafana`, `dns-server` phản hồi. |

```powershell
# Mục 3: database mặc định
docker compose exec relational-database-server mariadb -uroot -proot -D minicloud -e "SHOW TABLES; SELECT * FROM notes;"

# Mục 6: DNS mặc định (image Bind9 có sẵn dig)
docker compose exec internal-dns-server dig '@127.0.0.1' web-frontend-server.cloud.local +short

# Mục 9: ba tuyến gateway
curl.exe -I http://localhost/
curl.exe http://localhost/api/hello
curl.exe -I http://localhost/auth/

# Mục 10: ping các service trên cloud-net
"web","app-server","db","keycloak","minio","prometheus","grafana","dns-server" |
  ForEach-Object { docker compose exec -T internal-dns-server ping -c 1 -W 2 $_ }
```

### Bước 3 — Demo 10 yêu cầu mở rộng

| # | Thao tác | Kết quả cần thấy |
|---|---|---|
| 1. Ba blog tĩnh | Từ trang chủ mở `/blog/blog1.html`, `/blog/blog2.html`, `/blog/blog3.html` | Mỗi bài có ảnh và đường về trang chủ; ảnh Unsplash cần Internet. |
| 2. API sinh viên | `curl.exe http://localhost/api/student` | JSON gồm 5 bản ghi với `id`, `name`, `major`, `gpa`. |
| 3. Student DB | Chạy SQL `studentdb.students` bên dưới | Có các cột theo đề và ít nhất 3 bản ghi. |
| 4. Realm theo MSSV | Mở Keycloak, chọn `realm_<MSSV>`, xem `sv01`, `sv02`, client public `flask-app`; lấy token theo lệnh bên dưới | `/api/secure` trả `Secure resource OK` với token hợp lệ, không token trả `401`. |
| 5. Hai bucket | Trong MinIO Console xem `profile-pics/avatar.jpg` và `documents/sample-report.pdf`; tải bằng lệnh bên dưới | Ảnh và PDF tải công khai được. |
| 6. DNS mở rộng | Truy vấn ba tên bằng `dig` bên dưới | App `10.10.10.20`, MinIO `10.10.10.30`, Keycloak `10.10.10.40`. Đây là IP minh họa trong zone, không phải IP container. |
| 7. Web target | Mở Prometheus Targets, chạy `up{job="web"}` | Hai web target `UP`, giá trị `1`. |
| 8. Grafana theo MSSV | Mở System Health | Dashboard cần mang MSSV thật và có dữ liệu CPU/RAM/network; hiện tên vẫn là `System Health of MSSV` và UID datasource cần kiểm tra. |
| 9. Route `/student/` | `curl.exe http://localhost/student/` | Nhận cùng JSON 5 sinh viên qua gateway. |
| 10. Round robin | Chạy lệnh xem header bên dưới | `X-Upstream-Addr` luân phiên giữa hai web node. |

```powershell
# Mục 3: studentdb
docker compose exec relational-database-server mariadb -uroot -proot -D studentdb -e "DESCRIBE students; SELECT id,student_id,fullname,dob,major FROM students;"

# Mục 4: thay realm và password bằng giá trị trong .env
$realm = "realm_<MSSV>"
$token = (Invoke-RestMethod -Method Post `
  -Uri "http://localhost:8080/realms/$realm/protocol/openid-connect/token" `
  -Body @{grant_type="password"; client_id="flask-app"; username="sv01"; password="student123"}).access_token
Invoke-RestMethod -Uri "http://localhost/api/secure" -Headers @{Authorization="Bearer $token"}
curl.exe -i http://localhost/api/secure

# Mục 5: GET và lưu hai object công khai
curl.exe -f -o avatar-demo.jpg http://localhost:9000/profile-pics/avatar.jpg
curl.exe -f -o report-demo.pdf http://localhost:9000/documents/sample-report.pdf

# Mục 6: DNS mở rộng
docker compose exec internal-dns-server dig '@127.0.0.1' app-backend.cloud.local +short
docker compose exec internal-dns-server dig '@127.0.0.1' minio.cloud.local +short
docker compose exec internal-dns-server dig '@127.0.0.1' keycloak.cloud.local +short

# Mục 10: xem hai địa chỉ upstream luân phiên
1..6 | ForEach-Object { (Invoke-WebRequest "http://localhost/?lb=$_").Headers["X-Upstream-Addr"] }
```

### Demo từ EC2

Trên EC2, đồng bộ repository và `.env`, chạy `docker compose up -d --build`, sau đó kiểm tra `docker compose ps -a`. Trong các URL trên, thay `localhost` bằng public IP hoặc DNS của EC2. Lệnh `docker compose exec` chạy trong phiên SSH trên EC2. Để mở các trang từ laptop, Security Group cần cho phép các cổng TCP `80`, `8080`, `9000`, `9001`, `9090`, `3000` và UDP `1053` nếu truy vấn DNS trực tiếp từ ngoài. Không kết luận EC2 đã đạt chỉ dựa trên kết quả local.
