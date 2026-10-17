# MyMiniCloud – Cloud Simulation Platform

Hệ thống mô phỏng nền tảng điện toán đám mây thu nhỏ (**MyMiniCloud**) gồm **9 loại máy chủ cơ bản**, vận hành bằng Docker Container trong mạng nội bộ `cloud-net` và điều phối qua `docker-compose.yml`.

---

## 🏗️ Kiến Trúc 9 Servers & Phân Loại Image

| STT | Service Name | Loại Image | Tên Image (Docker Hub) | Port (Host:Container) | Vai trò |
| :-- | :--- | :--- | :--- | :--- | :--- |
| 1 | `web-frontend-server` | **Custom (Dockerfile)** | `<user>/myminicloud-web:latest` | Internal (Scaled) | Web tĩnh & Blog |
| 2 | `application-backend-server` | **Custom (Dockerfile)** | `<user>/myminicloud-app:latest` | `8085:8081` | Python Flask REST API |
| 3 | `relational-database-server` | **Official** | `mariadb:11` | `3306:3306` | CSDL MariaDB |
| 4 | `authentication-identity-server` | **Official** | `quay.io/keycloak/keycloak:latest` | `8081:8080` | SSO & Identity Keycloak |
| 5 | `object-storage-server` | **Official** | `quay.io/minio/minio` | `9000:9000`, `9001:9001` | Object Storage MinIO |
| 6 | `internal-dns-server` | **Official** | `internetsystemsconsortium/bind9:9.18`| `1053:53/udp` | Internal DNS Bind9 |
| 7a | `monitoring-node-exporter-server` | **Official** | `prom/node-exporter:latest` | `9100:9100` | Thu thập metrics Node |
| 7b | `monitoring-prometheus-server` | **Official** | `prom/prometheus:latest` | `9090:9090` | Thu thập & lưu trữ Metrics |
| 8 | `monitoring-grafana-dashboard-server`| **Official** | `grafana/grafana:latest` | `3000:3000` | Dashboard Grafana |
| 9 | `api-gateway-proxy-server` | **Custom (Dockerfile)** | `<user>/myminicloud-proxy:latest` | `80:80` | Nginx Gateway & Proxy |

---

## 📁 Cấu Trúc Thư Mục

```text
.
├── app/                  # Custom Backend (có Dockerfile riêng)
├── auth/                 # Keycloak identity
├── db/                   # MariaDB init scripts (001_init.sql, 002_studentdb.sql)
├── dns/                  # Bind9 DNS configs & cloud.local zone
├── grafana/              # Grafana dashboards
├── monitor/              # Prometheus config (prometheus.yml)
├── proxy/                # Custom Gateway Nginx (có Dockerfile riêng)
├── storage/              # MinIO Object Storage volume
├── web/                  # Custom Web Frontend (có Dockerfile riêng)
├── docker-compose.yml    # File điều phối toàn bộ 9 services
├── .env.example          # File mẫu cấu hình username Docker Hub
└── README.md
```

---

## 📦 Quy Trình Build & Push Lên Docker Hub

### Bước 1: Đăng nhập Docker Hub
```bash
docker login
```

### Bước 2: Thiết lập biến môi trường Username của bạn
* **Trên Linux / EC2 / macOS**:
  ```bash
  export DOCKER_USER="username_dockerhub_cua_ban"
  ```
* **Trên Windows PowerShell**:
  ```powershell
  $env:DOCKER_USER="username_dockerhub_cua_ban"
  ```
*(Hoặc tạo file `.env` với nội dung `DOCKER_USER=username_dockerhub_cua_ban`)*

### Bước 3: Build và Push toàn bộ custom images
```bash
# 1. Build các images tự code
docker compose build

# 2. Push lên Docker Hub
docker compose push
```

---

## 🚀 Triển Khai Trên Máy Mới / EC2 (Chỉ Pull và Chạy)

Trên máy chủ mới (EC2) không cần build lại source code, chỉ cần tải `docker-compose.yml` (hoặc clone repo) rồi pull images về:

```bash
# Đặt username dockerhub chứa image
export DOCKER_USER="username_dockerhub_cua_ban"

# Tải tất cả image (cả official và custom từ Docker Hub)
docker compose pull

# Khởi chạy hệ thống (scale 2 web frontend)
docker compose up -d --scale web-frontend-server=2
```

---

## 🧪 Kiểm Thử Nhanh (Endpoints)

* **Trang chủ Web**: [http://localhost](http://localhost) (hoặc qua IP Public EC2)
* **Blog cá nhân**: [http://localhost/blog/](http://localhost/blog/)
* **Backend Hello API**: [http://localhost/api/hello](http://localhost/api/hello)
* **API Sinh viên (JSON)**: [http://localhost/student/](http://localhost/student/)
* **API Sinh viên (DB CRUD)**: [http://localhost/api/students-db](http://localhost/api/students-db)
* **Keycloak Admin**: [http://localhost:8081](http://localhost:8081) (`admin` / `admin`)
* **MinIO Console**: [http://localhost:9001](http://localhost:9001) (`minioadmin` / `minioadmin`)
* **Prometheus**: [http://localhost:9090](http://localhost:9090)
* **Grafana**: [http://localhost:3000](http://localhost:3000) (`admin` / `admin`)
