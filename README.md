# MyMiniCloud – Cloud Simulation Platform

Hệ thống mô phỏng nền tảng điện toán đám mây thu nhỏ (**MyMiniCloud**) gồm **9 loại máy chủ cơ bản**, vận hành bằng Docker Container trong mạng nội bộ `cloud-net` và điều phối qua `docker-compose.yml`.

---

## 🏗️ Kiến Trúc Hệ Thống (9 Servers)

| STT | Service Name | Công nghệ | Port (Host:Container) | Vai trò |
| :-- | :--- | :--- | :--- | :--- |
| 1 | `web-frontend-server` | Nginx (HTML/Blog) | Internal (Scaled) | Cung cấp giao diện web tĩnh, bài viết blog |
| 2 | `application-backend-server` | Python Flask | `8085:8081` | Xử lý REST API, JSON & CSDL |
| 3 | `relational-database-server` | MariaDB 11 | `3306:3306` | CSDL quan hệ (RDBMS) |
| 4 | `authentication-identity-server` | Keycloak | `8081:8080` | Quản lý định danh SSO, cấp phát OIDC Token |
| 5 | `object-storage-server` | MinIO | `9000:9000`, `9001:9001` | Object Storage tương thích S3 (API & Console) |
| 6 | `internal-dns-server` | Bind9 | `1053:53/udp` | Phân giải DNS nội bộ (`cloud.local`) |
| 7a | `monitoring-node-exporter-server` | Node Exporter | `9100:9100` | Thu thập metrics tài nguyên container/host |
| 7b | `monitoring-prometheus-server` | Prometheus | `9090:9090` | Lưu trữ và truy vấn metrics |
| 8 | `monitoring-grafana-dashboard-server` | Grafana | `3000:3000` | Dashboard trực quan hóa giám sát |
| 9 | `api-gateway-proxy-server` | Nginx Proxy | `80:80` | Điểm vào duy nhất, Routing, Round-Robin Load Balancing |

---

## 📁 Cấu Trúc Thư Mục

```text
.
├── app/                  # Flask Backend Server + students.json
├── auth/                 # Authentication / Keycloak config
├── db/                   # MariaDB init scripts (001_init.sql, 002_studentdb.sql)
├── dns/                  # Bind9 DNS configs & cloud.local zone
├── grafana/              # Grafana dashboards & provisioning
├── monitor/              # Prometheus config (prometheus.yml)
├── proxy/                # Nginx API Gateway & Reverse Proxy (nginx.conf)
├── storage/              # MinIO Object Storage volume data
├── web/                  # Nginx Web Frontend (Home page & Blog)
├── docker-compose.yml    # File điều phối toàn bộ 9 services
└── README.md
```

---

## 🚀 Hướng Dẫn Khởi Chạy

### 1. Yêu cầu tiên quyết
* Đã cài đặt [Docker](https://docs.docker.com/get-docker/) và Docker Compose v2.

### 2. Khởi chạy cơ bản
```bash
docker compose build --no-cache
docker compose up -d
```

### 3. Dynamic Scaling (Mở rộng số lượng Web Server linh hoạt)
Hệ thống hỗ trợ scale số lượng web frontend tức thì, Nginx Proxy sẽ tự động phát hiện và cân bằng tải (Round-Robin) qua DNS nội bộ Docker:
```bash
# Chạy với 2 web instances
docker compose up -d --scale web-frontend-server=2

# Tăng lên 4 web instances
docker compose up -d --scale web-frontend-server=4
```

### 4. Kiểm tra trạng thái
```bash
docker compose ps
```

---

## 🧪 Kiểm Thử Nhanh (Endpoints & Testing)

* **Trang chủ Web**: [http://localhost](http://localhost) (hoặc qua IP EC2)
* **Blog cá nhân**: [http://localhost/blog/](http://localhost/blog/)
* **Backend Hello API**: [http://localhost/api/hello](http://localhost/api/hello)
* **API Sinh viên (JSON)**: [http://localhost/student/](http://localhost/student/) hoặc [http://localhost/api/student](http://localhost/api/student)
* **API Sinh viên (MariaDB CRUD)**: [http://localhost/api/students-db](http://localhost/api/students-db)
* **Keycloak Admin Console**: [http://localhost:8081](http://localhost:8081) (`admin` / `admin`)
* **MinIO Console**: [http://localhost:9001](http://localhost:9001) (`minioadmin` / `minioadmin`)
* **Prometheus Metrics**: [http://localhost:9090](http://localhost:9090)
* **Grafana Dashboard**: [http://localhost:3000](http://localhost:3000) (`admin` / `admin`)
* **DNS Query test**:
  ```bash
  dig @127.0.0.1 -p 1053 web-frontend-server.cloud.local +short
  ```
