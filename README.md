# MyMiniCloud – Cloud Simulation Platform

Hệ thống mô phỏng nền tảng điện toán đám mây thu nhỏ (**MyMiniCloud**) gồm **9 loại máy chủ cơ bản**, vận hành bằng Docker Container trong mạng nội bộ `cloud-net`, điều phối linh hoạt qua `docker-compose.yml`, tích hợp **Dynamic Scaling**, tự động hóa với **GitHub Actions CI/CD** và được tối ưu hóa tài nguyên hoàn hảo cho máy chủ **VPS 1GB RAM (AWS EC2)**.

---

## 🏗️ Kiến Trúc 9 Servers & Phân Loại Image

| STT | Service Name | Loại Image | Tên Image (Docker Hub) | Port (Host:Container) | Vai trò |
| :-- | :--- | :--- | :--- | :--- | :--- |
| 1a | `web-frontend-server1` | **Custom (Dockerfile)** | `<user>/myminicloud-web:latest` | `8080:80` | Web tĩnh chính & Blog cá nhân (Cluster node 1) |
| 1b | `web-frontend-server2` | **Custom (Dockerfile)** | `<user>/myminicloud-web:latest` | Internal (Cluster node 2) | Web tĩnh phụ phục vụ Round-Robin Load Balancing |
| 2 | `application-backend-server` | **Custom (Dockerfile)** | `<user>/myminicloud-app:latest` | `8085:8081` | Python Flask REST API & DB Connection |
| 3 | `relational-database-server` | **Official** | `mariadb:11` | `3306:3306` | CSDL quan hệ MariaDB |
| 4 | `authentication-identity-server` | **Official** | `quay.io/keycloak/keycloak:latest` | `8081:8080` | SSO & Identity Keycloak (OIDC Token) |
| 5 | `object-storage-server` | **Official** | `chrislusf/seaweedfs:latest` | `9000:9000`, `9001:9001` | Object Storage SeaweedFS (S3 API & Web UI) |
| 6 | `internal-dns-server` | **Official** | `internetsystemsconsortium/bind9:9.18`| `1053:53/udp` | Internal DNS Bind9 (`cloud.local`) |
| 7a | `monitoring-node-exporter-server` | **Official** | `prom/node-exporter:latest` | `9100:9100` | Thu thập metrics tài nguyên Node |
| 7b | `monitoring-prometheus-server` | **Official** | `prom/prometheus:latest` | `9090:9090` | Thu thập & lưu trữ Metrics hệ thống |
| 8 | `monitoring-grafana-dashboard-server`| **Official** | `grafana/grafana:latest` | `3000:3000` | Dashboard trực quan hóa Grafana (Auto-provisioned) |
| 9 | `api-gateway-proxy-server` | **Custom (Dockerfile)** | `<user>/myminicloud-proxy:latest` | `80:80` | Nginx Gateway, Routing & Round-Robin Load Balancing |

---

## 📁 Cấu Trúc Thư Mục

```text
.
├── app/                  # Custom Backend Flask API + students.json (có Dockerfile)
├── auth/                 # Keycloak identity volume (.gitkeep)
├── db/                   # MariaDB init scripts (001_init.sql, 002_studentdb.sql)
├── dns/                  # Bind9 DNS configs & db.cloud.local zone
├── grafana/              # Grafana dashboards (.gitkeep)
├── monitor/              # Prometheus config (prometheus.yml)
├── proxy/                # Custom Gateway Nginx Dynamic DNS (có Dockerfile)
├── storage/              # SeaweedFS Object Storage volume data
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
   * **SeaweedFS**: Thay thế MinIO giúp giảm tải RAM từ 150MB xuống chỉ còn **~30MB - 50MB**.
   * Toàn bộ services đều được thiết lập trần bộ nhớ (`deploy.resources.limits.memory`).

---

## 🔄 Dynamic Scaling (Mở rộng Web Server không cần sửa code)

Hệ thống sử dụng Docker Internal DNS Resolver (`127.0.0.11`) trong Nginx Proxy để tự động cân bằng tải Round-Robin khi scale:

```bash
# Chạy với 2 Web Frontend instances
docker compose up -d --scale web-frontend-server=2

# Tăng tải lên 4 Web Frontend instances
docker compose up -d --scale web-frontend-server=4

# Kiểm tra danh sách container
docker compose ps
```

---

## 🚀 Tự Động Hóa CI/CD (GitHub Actions)

Mỗi lần `git push origin main`:
1. **CI**: GitHub Actions tự động build 3 custom images (`web`, `app`, `proxy`) và push lên Docker Hub của bạn.
2. **CD**: SSH an toàn vào EC2, tự động đồng bộ file cấu hình qua `scp`, pull images mới nhất và reload container (`docker compose up -d`).

### Cấu hình Secrets trên GitHub Repo:
Vào **Settings** ➔ **Secrets and variables** ➔ **Actions**:
* `DOCKERHUB_USERNAME`: Tên tài khoản Docker Hub.
* `DOCKERHUB_TOKEN`: Personal Access Token trên Docker Hub (quyền *Read & Write*).
* `EC2_HOST`: Địa chỉ IP Public hoặc Public IPv4 DNS của EC2.
* `EC2_SSH_KEY`: Toàn bộ nội dung file `.pem` dùng để SSH.
* `EC2_USER`: `ec2-user` (Amazon Linux) hoặc `ubuntu` (Ubuntu).

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
  - Đăng bài blog của riêng mình với ảnh minh họa tự động lưu trữ lên **SeaweedFS S3 Object Storage**.
  - Quản lý bài viết cá nhân tại tab **Blog của tôi** (`#my-blogs`) - chỉ được sửa/xóa bài của chính mình.
* **Khách (Chưa đăng nhập)**:
  - Xem danh sách bài viết blog công khai và đọc chi tiết bài viết.

### 2. Thiết lập tự động Keycloak:
Chạy script tự động cấu hình client `flask-app`, role `admin`, `student` và 5 tài khoản sinh viên mẫu:
```bash
python setup_keycloak.py
```

---

## 🧪 Danh Sách Kiểm Thử Các Dịch Vụ (Endpoints)

| Dịch vụ | Đường dẫn truy cập | Kết quả kiểm thử kỳ vọng |
| :--- | :--- | :--- |
| **Web App (Student Blog)** | `http://<IP_EC2>/` | Giao diện Web App Blog Sinh Viên hoàn chỉnh (SPA, Load-balanced) |
| **Blog API (Public)** | `http://<IP_EC2>/api/blogs` | Danh sách bài blog (JSON) từ MariaDB |
| **Upload Ảnh (S3)** | `POST http://<IP_EC2>/api/upload` | Upload ảnh lên SeaweedFS S3 (Yêu cầu JWT) |
| **API Hello** | `http://<IP_EC2>/api/hello` | Trả về JSON `{"message": "Hello from App Server!"}` |
| **API Sinh viên (JSON)** | `http://<IP_EC2>/student/` | Danh sách 5 sinh viên từ `students.json` |
| **API Sinh viên (DB CRUD)** | `http://<IP_EC2>/api/students-db` | Quản lý sinh viên trên MariaDB `studentdb` (Yêu cầu Role `admin`) |
| **Keycloak Admin** | `http://<IP_EC2>:8081` | Đăng nhập Admin Console (`admin` / `admin`) |
| **SeaweedFS S3 API** | `http://<IP_EC2>:9000` | Cổng API S3 tạo Bucket & Upload File |
| **SeaweedFS Web UI** | `http://<IP_EC2>:9001` | Trình duyệt giao diện xem Volume / File |
| **Prometheus** | `http://<IP_EC2>:9090` | Quản lý metrics hệ thống, xem trạng thái targets UP |
| **Grafana** | `http://<IP_EC2>:3000` | Dashboard biểu đồ CPU, RAM, Network (`admin` / `admin`) |
| **Internal DNS** | Port UDP `1053` | Phân giải `web-frontend-server.cloud.local` |
