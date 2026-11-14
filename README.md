# MyMiniCloud – Cloud Simulation Platform

Hệ thống mô phỏng nền tảng điện toán đám mây thu nhỏ (**MyMiniCloud**) gồm **9 loại máy chủ cơ bản**, vận hành bằng Docker Container trong mạng nội bộ `cloud-net`, điều phối qua `docker-compose.yml` và cân bằng tải giữa **2 web node**. Có thể chạy trên local hoặc triển khai thủ công lên EC2.

---

## Kiến Trúc 9 Servers & Phân Loại Image

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

## Cấu Trúc Thư Mục

```text
.
├── app/                  # Custom Backend Flask API, students.json, setup_keycloak.py (có Dockerfile)
├── db/                   # MariaDB init scripts và migration (001–003)
├── dns/                  # Bind9 DNS configs & db.cloud.local zone
├── grafana/              # Grafana datasource và dashboard provisioning
├── monitor/              # Prometheus config (prometheus.yml)
├── proxy/                # Custom Gateway Nginx Dynamic DNS (có Dockerfile)
├── storage/              # MinIO Object Storage volume data
├── web/                  # Custom Web Frontend HTML & 3 Blog posts (có Dockerfile)
├── docker-compose.yml    # File điều phối các service
├── .env.example          # Mẫu cấu hình biến môi trường
└── README.md
```

---

## Tối Ưu Hóa Bộ Nhớ Cho VPS 1GB RAM (AWS EC2)

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

## Cân bằng tải giữa 2 web node

Compose chạy sẵn `web-frontend-server1` và `web-frontend-server2`. Nginx Proxy phân phối request round robin giữa hai node này. Cấu hình hiện tại chưa hỗ trợ lệnh `--scale` để tăng lên 4 node.

```bash
docker compose up -d --build
docker compose ps -a
# Gọi nhiều lần và xem X-Upstream-Addr thay đổi giữa hai web node
curl -I http://localhost/
curl -I http://localhost/
```

---

## Triển khai EC2

Đồng bộ repository và `.env` lên EC2, sau đó chạy `docker compose up -d --build`. Ba image tùy chỉnh (`web`, `app`, `proxy`) được build từ Dockerfile trong repository.

---

## Student Blog Platform & Phân Quyền 2 Tầng (Role-Based Access Control)

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

## Chạy và demo (Windows, macOS, Linux)

Chạy tại thư mục chứa `docker-compose.yml`. Sao chép `.env.example` thành `.env` nếu chưa có, rồi đặt `KEYCLOAK_REALM=realm_<MSSV>` và `DOCKER_USER=<Docker_Hub_username>`. Các mật khẩu demo và MinIO có giá trị mặc định trong Compose. Thay `storage/sample-report.pdf` bằng báo cáo thật nếu cần trình bày file của bạn.

```sh
docker compose config --quiet
docker compose up -d --build
docker compose ps -a
docker compose logs --tail=30 keycloak-bootstrap minio-bootstrap db-schema-migration
```

Keycloak có thể mất vài phút ở lần chạy đầu. Chờ gateway ở trạng thái `Up`; ba service bootstrap/migration phải là `Exited (0)`. Nếu một service lỗi, xem `docker compose logs <service>`, rồi chạy lại `docker compose up -d --build`. Các URL dưới đây dùng `localhost`; khi xem từ máy khác, thay bằng IP/DNS của EC2. Trên Windows PowerShell, dùng `curl.exe` thay cho `curl` trong ví dụ.

### 10 mục mặc định

| # | Demo | Kết quả cần thấy |
|---|---|---|
| 1 | Mở `/` và `/blog/blog1.html` | Trang chủ và bài viết hiển thị. |
| 2 | Mở `:8081/hello` và `/api/hello` | Cùng JSON `Hello from App Server!`. |
| 3 | Truy vấn `minicloud.notes` | Có bảng và dữ liệu mẫu. |
| 4 | Mở `:8080`, đăng nhập Keycloak `admin/admin` | Admin Console hoạt động. |
| 5 | Mở MinIO Console `:9001`, tạo bucket `demo`, upload `web/html/index.html` | File xuất hiện và tải lại được. |
| 6 | Tra DNS `web-frontend-server.cloud.local` | Trả `10.10.10.10`. |
| 7 | Mở Prometheus `:9090/targets` | Node exporter `UP`. |
| 8 | Mở Grafana `:3000`, đăng nhập `admin/admin` | Biểu đồ CPU, RAM, network có dữ liệu. |
| 9 | Mở `/`, `/api/hello`, `/auth/` qua cổng 80 | Gateway chuyển đến web, app, Keycloak. |
| 10 | Ping các alias trong `cloud-net` | `web`, `app-server`, `db`, `keycloak`, `minio`, `prometheus`, `grafana`, `dns-server` phản hồi. |

```sh
docker compose exec relational-database-server mariadb -uroot -proot -D minicloud -e "SELECT * FROM notes;"
docker compose exec internal-dns-server dig '@127.0.0.1' web-frontend-server.cloud.local +short
docker compose exec internal-dns-server ping -c 1 web
```

### 10 mục mở rộng

| # | Demo | Kết quả cần thấy |
|---|---|---|
| 1 | Mở `/blog/blog1.html`, `blog2.html`, `blog3.html` từ trang chủ | Mỗi bài có ảnh và liên kết về trang chủ. |
| 2 | Mở `/api/student` | JSON gồm 5 sinh viên với `id`, `name`, `major`, `gpa`. |
| 3 | Truy vấn `studentdb.students` | Đủ cột và ít nhất 3 bản ghi. |
| 4 | Trong Keycloak chọn `realm_<MSSV>`; xem `sv01`, `sv02`, client `flask-app`; lấy token và gọi `/api/secure` | Token hợp lệ trả `Secure resource OK`; thiếu token trả `401`. |
| 5 | Mở MinIO Console `:9001` và hai URL object bên dưới | Có `profile-pics/avatar.jpg` và `documents/sample-report.pdf`; tải được. |
| 6 | Tra DNS `app-backend`, `minio`, `keycloak` trong `cloud.local` | Lần lượt `10.10.10.20`, `.30`, `.40`. |
| 7 | Trong Prometheus chạy `up{job="web"}` | Hai web target đều có giá trị `1`. |
| 8 | Mở dashboard System Health trong Grafana | Tiêu đề mang MSSV và ba biểu đồ có dữ liệu. |
| 9 | Mở `/student/` qua gateway | Cùng JSON 5 sinh viên. |
| 10 | Tải lại `/` nhiều lần, xem response header `X-Upstream-Addr` trong Developer Tools | Header luân phiên giữa hai web node. |

```sh
docker compose exec relational-database-server mariadb -uroot -proot -D studentdb -e "DESCRIBE students; SELECT * FROM students;"
docker compose exec internal-dns-server dig '@127.0.0.1' app-backend.cloud.local +short
docker compose exec internal-dns-server dig '@127.0.0.1' minio.cloud.local +short
docker compose exec internal-dns-server dig '@127.0.0.1' keycloak.cloud.local +short
```

Object công khai: `http://localhost:9000/profile-pics/avatar.jpg` và `http://localhost:9000/documents/sample-report.pdf`. Để lấy token, dùng một trong hai lệnh sau và thay realm/mật khẩu theo `.env`:

**PowerShell:**

```powershell
$realm = "realm_<MSSV>"
$token = (Invoke-RestMethod -Method Post -Uri "http://localhost:8080/realms/$realm/protocol/openid-connect/token" -Body @{grant_type="password"; client_id="flask-app"; username="sv01"; password="student123"}).access_token
Invoke-RestMethod -Uri "http://localhost/api/secure" -Headers @{Authorization="Bearer $token"}
```

**Bash (macOS/Linux/EC2):**

```sh
realm='realm_<MSSV>'
token=$(curl -s -X POST "http://localhost:8080/realms/$realm/protocol/openid-connect/token" -d grant_type=password -d client_id=flask-app -d username=sv01 -d password=student123 | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
curl -H "Authorization: Bearer $token" http://localhost/api/secure
```

**Cần kiểm tra trước khi chấm:** `/blog/` hiện chuyển `301` về `/` thay vì trả trang blog `200` như ví dụ đề. Dashboard Grafana vẫn mang chữ `MSSV` và datasource UID trong dashboard cần khớp cấu hình datasource; chỉ đánh dấu mục Grafana đạt khi ba biểu đồ có dữ liệu. Bản ghi DNS `10.10.10.x` là dữ liệu minh họa theo đề, không phải IP container.

Trên EC2, chạy cùng lệnh Compose qua SSH và thay `localhost` trong URL bằng public IP/DNS. Mở các cổng cần trình bày trong Security Group: TCP `80`, `8080`, `9000`, `9001`, `9090`, `3000`; UDP `1053` chỉ khi truy vấn DNS từ ngoài EC2.
