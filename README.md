# MyMiniCloud – Cloud Simulation Platform

Hệ thống mô phỏng nền tảng điện toán đám mây thu nhỏ (**MyMiniCloud**) gồm **9 loại máy chủ cơ bản**, vận hành bằng Docker Container trong mạng nội bộ `cloud-net`, điều phối qua `docker-compose.yml` và cân bằng tải giữa **2 web node**. GitHub Actions hiện build/push image; EC2 được triển khai thủ công.

---

## 🏗️ Kiến Trúc 9 Servers & Phân Loại Image

| STT | Service Name | Loại Image | Tên Image (Docker Hub) | Port (Host:Container) | Vai trò |
| :-- | :--- | :--- | :--- | :--- | :--- |
| 1a | `web-frontend-server1` | **Custom (Dockerfile)** | `<user>/myminicloud-web:latest` | `8001:80` | Web tĩnh chính & Blog cá nhân (Cluster node 1) |
| 1b | `web-frontend-server2` | **Custom (Dockerfile)** | `<user>/myminicloud-web:latest` | `8002:80` | Web tĩnh phụ phục vụ Round-Robin Load Balancing (Cluster node 2) |
| 2 | `application-backend-server` | **Custom (Dockerfile)** | `<user>/myminicloud-app:latest` | `8081:8081` | Python Flask REST API & DB Connection |
| 3 | `relational-database-server` | **Official** | `mariadb:11` | `3306:3306` | CSDL quan hệ MariaDB |
| 4 | `authentication-identity-server` | **Official** | `quay.io/keycloak/keycloak:latest` | `8080:8080` | SSO & Identity Keycloak (OIDC Token) |
| 5 | `object-storage-server` | **Community source build** | `ghcr.io/intikhab49/minio-from-source:RELEASE.2025-10-15T17-29-55Z` | `9000:9000`, `9001:9001` | Object Storage MinIO (S3 API & Web UI) |
| 6 | `internal-dns-server` | **Official** | `internetsystemsconsortium/bind9:9.18`| `1053:53/udp` | Internal DNS Bind9 (`cloud.local`) |
| 7a | `monitoring-node-exporter-server` | **Official** | `prom/node-exporter:latest` | `9100:9100` | Thu thập metrics tài nguyên Node |
| 7b | `monitoring-prometheus-server` | **Official** | `prom/prometheus:latest` | `9090:9090` | Thu thập & lưu trữ Metrics hệ thống |
| 8 | `monitoring-grafana-dashboard-server`| **Official** | `grafana/grafana:latest` | `3000:3000` | Dashboard trực quan hóa Grafana (Auto-provisioned) |
| 9 | `api-gateway-proxy-server` | **Custom (Dockerfile)** | `<user>/myminicloud-proxy:latest` | `80:80` | Nginx Gateway, Routing & Round-Robin Load Balancing |

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

Để hệ thống 9 server hoạt động mượt mà và không bao giờ bị OOM (Out Of Memory) Crash trên máy chủ 1GB RAM:

1. **Tạo 2GB Swap Memory (Bắt buộc chạy trên EC2)**:
   ```bash
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```
2. **Cấu hình kìm hãm tài nguyên trong `docker-compose.yml`**:
   * **Keycloak**: Giới hạn JVM Heap `-Xms64m -Xmx300m -XX:+UseSerialGC` và trần RAM `450M`.
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
2. Trên EC2, đồng bộ repository (gồm `docker-compose.yml`, `db/init`, `web/html`, `web/conf.default`, `proxy/nginx.conf`), rồi chạy `docker compose pull && docker compose up -d`. Workflow hiện chưa tự SSH/deploy lên EC2.

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
`docker compose up -d --build` chạy service `keycloak-bootstrap` sau khi Keycloak khởi động. Service này chờ Keycloak sẵn sàng, tạo client `flask-app`, role `admin`/`student` và 5 tài khoản sinh viên mẫu; gateway chỉ khởi động sau khi bước này và migration DB hoàn tất. Xem kết quả bằng:
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
| **MinIO Web UI** | `http://<IP_EC2>:9001` | Trình duyệt giao diện xem Volume / File |
| **Prometheus** | `http://<IP_EC2>:9090` | Quản lý metrics hệ thống, xem trạng thái targets UP |
| **Grafana** | `http://<IP_EC2>:3000` | Dashboard biểu đồ CPU, RAM, Network (`admin` / `admin`) |
| **Internal DNS** | Port UDP `1053` | Phân giải `web-frontend-server.cloud.local` |

## Course demo requirements 4–5 (exact commands)

Compose provisions a configurable Keycloak realm named `KEYCLOAK_REALM` (default `realm_SV001`), the public client `flask-app`, and users `sv01` / `sv02` (default password `student123`). The existing master realm and `admin/admin` console remain available. The backend accepts a token from the configured realm at `/secure` (direct) or `/api/secure` (gateway); issuer validation uses the token's own issuer, so local and EC2 hosts are not hardcoded.

MinIO is used instead of SeaweedFS because the rubric explicitly requires MinIO; the pinned image is a community build from MinIO source because upstream registry pulls are unavailable anonymously. `minio-bootstrap` idempotently creates persistent buckets `profile-pics` and `documents`, enables anonymous download, and uploads `avatar.jpg` and the small `sample-report.pdf`. Replace the sample PDF in `storage/sample-report.pdf` with the student's real report before a private submission; do not commit a private report.

### Local demo

```bash
cp .env.example .env
docker compose up -d --build
docker compose ps -a
docker compose logs keycloak-bootstrap minio-bootstrap
TOKEN=$(curl -s -X POST "http://localhost:8080/realms/${KEYCLOAK_REALM:-realm_SV001}/protocol/openid-connect/token" -d client_id=flask-app -d username=sv01 -d password="${SV01_PASSWORD:-student123}" -d grant_type=password | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
curl -i http://localhost/api/secure -H "Authorization: Bearer $TOKEN"
curl -i http://localhost:9000/profile-pics/avatar.jpg
curl -i http://localhost:9000/documents/sample-report.pdf
```

### EC2 demo

Open TCP ports 80 and 8080 (and 9000 only for the direct object URL), then run these exact commands on the EC2 host:

```bash
export EC2_HOST=<EC2_PUBLIC_DNS_OR_IP>
export KEYCLOAK_REALM=${KEYCLOAK_REALM:-realm_SV001}
export SV01_PASSWORD=${SV01_PASSWORD:-student123}
docker compose up -d --build
docker compose logs keycloak-bootstrap minio-bootstrap
TOKEN=$(curl -s -X POST "http://${EC2_HOST}:8080/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token" -d client_id=flask-app -d username=sv01 -d password="$SV01_PASSWORD" -d grant_type=password | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
curl -i "http://${EC2_HOST}/api/secure" -H "Authorization: Bearer $TOKEN"
curl -i "http://${EC2_HOST}:9000/profile-pics/avatar.jpg"
curl -i "http://${EC2_HOST}:9000/documents/sample-report.pdf"
```

The token issuer URL uses the same host used by the token request; no public host is baked into Compose. For a safer presentation, show the MinIO console at `http://${EC2_HOST}:9001` using the configured root credentials.
