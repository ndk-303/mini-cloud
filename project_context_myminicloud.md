# PROJECT CONTEXT: HỆ THỐNG MÔ PHỎNG MINICLOUD (MyMiniCloud)

> **Mục đích tài liệu:** Cung cấp toàn bộ ngữ cảnh, yêu cầu kỹ thuật, kiến trúc, cấu hình mã nguồn và kịch bản kiểm thử của dự án **MyMiniCloud** để AI Agent hoặc Developer có thể tự động hóa việc khởi tạo, phát triển phần mở rộng, sửa lỗi (debug), triển khai (deploy) và viết báo cáo.

---

## 1. TỔNG QUAN & MỤC TIÊU DỰ ÁN
* **Tên dự án:** MyMiniCloud (`hotenSVminicloud` / `NhomSominiclouddemo`).
* **Mục tiêu:** Xây dựng hệ thống Cloud thu nhỏ gồm **9 loại máy chủ (server) cơ bản** (+1 Node Exporter hỗ trợ), mô phỏng các thành phần cốt lõi trong hạ tầng của một Cloud Platform thực tế (như AWS, Azure, GCP).
* **Môi trường vận hành:** 
  * Mỗi server chạy trong một Docker Container riêng biệt.
  * Giao tiếp nội bộ qua một mạng Docker chung tên là `cloud-net`.
  * Khởi chạy đồng bộ thông qua `docker-compose.yml`.
  * Triển khai và kiểm thử trên cả máy **Local** và **AWS EC2 (Ubuntu)** (truy cập qua Public IP).
  * Push ít nhất 1 custom image (VD: `myminicloud-web` hoặc `hotensv/web:dev`) lên **Docker Hub**.

---

## 2. KIẾN TRÚC TỔNG THỂ & DANH SÁCH 9 SERVER BẮT BUỘC

### 2.1. Sơ đồ luồng kiến trúc (Architecture Flow)
```text
                  [ User / Client ]
                          │ (Port 80)
                          ▼
         ┌─────────────────────────────────┐
         │ 9. Reverse Proxy / API Gateway  │ (Nginx)
         └────────────────┬────────────────┘
        ┌─────────────────┼─────────────────┐
        ▼ (/)             ▼ (/api/)         ▼ (/auth/)
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ 1. Web Srv   │  │ 2. App Srv   │  │ 4. Auth Srv  │
│ (Nginx tĩnh) │  │ (Flask API)  │  │  (Keycloak)  │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       └─────────────────┼─────────────────┘
                         ▼
         ┌─────────────────────────────────┐
         │ 3. Database (MariaDB)           │
         │ 5. Object Storage (MinIO)       │
         └────────────────┬────────────────┘
                          ▼
         ┌─────────────────────────────────┐
         │ 7. Monitoring (Prometheus+Node) │
         │ 8. Visualization (Grafana)      │
         └────────────────┬────────────────┘
                          ▼
         ┌─────────────────────────────────┐
         │ 6. Internal DNS (Bind9)         │
         └─────────────────────────────────┘
*(Tất cả kết nối chung vào mạng nội bộ Docker: `cloud-net`)*
```

### 2.2. Bảng quy hoạch 9 loại Server & Cổng (Port Mapping)

| STT | Tên Service (Chuẩn hóa) | Vai trò chính | Công nghệ / Image | Port (Host:Container) |
| :-- | :--- | :--- | :--- | :--- |
| **1** | `web-frontend-server` | Cung cấp giao diện web tĩnh (`index.html`, `/blog/`) | `nginx:stable` (Custom build) | `8080:80` |
| **2** | `application-backend-server` | Xử lý logic, REST API (`/hello`, `/secure`), kết nối DB | `python:3.11-alpine` (Flask) | `8085:8081` |
| **3** | `relational-database-server` | Lưu trữ dữ liệu quan hệ (RDBMS) | `mariadb:11` | `3306:3306` |
| **4** | `authentication-identity-server` | Quản lý định danh, SSO, cấp phát OIDC Token | `quay.io/keycloak/keycloak:latest` | `8081:8080` |
| **5** | `object-storage-server` | Lưu trữ đối tượng phi cấu trúc (giống AWS S3) | `minio/minio` | `9000:9000` (API)<br>`9001:9001` (Console) |
| **6** | `internal-dns-server` | Phân giải tên miền nội bộ (`cloud.local`) | `internetsystemsconsortium/bind9:9.18` | `1053:53/udp` |
| **7** | `monitoring-prometheus-server` | Thu thập & truy vấn metrics hệ thống | `prom/prometheus:latest` | `9090:9090` |
| *7b*| `monitoring-node-exporter-server`| Agent thu thập metric phần cứng/container cho Prometheus | `prom/node-exporter:latest` | `9100:9100` |
| **8** | `monitoring-grafana-dashboard-server` | Trực quan hóa dữ liệu giám sát (Dashboard) | `grafana/grafana:latest` | `3000:3000` |
| **9** | `api-gateway-proxy-server` | Điểm vào duy nhất, định tuyến (routing), cân bằng tải | `nginx:stable` | `80:80` |

---

## 3. CẤU TRÚC THƯ MỤC DỰ ÁN

*(Lưu ý cho Agent: Tài liệu có đề cập 2 cách đặt tên thư mục là tên rút gọn `web`, `app`, `db`... và tên đầy đủ `web-frontend-server`... Phần code triển khai chuẩn bên dưới sử dụng **tên đầy đủ** như trong `docker-compose.yml`)*:

```text
NhomSominiclouddemo/ (hoặc hotenSVminicloud/)
├── docker-compose.yml
├── web-frontend-server/
│   ├── Dockerfile
│   ├── conf.default
│   └── html/
│       ├── index.html
│       └── blog/
│           └── index.html
├── application-backend-server/
│   ├── Dockerfile
│   ├── app.py
│   └── students.json             # (Dùng cho phần mở rộng)
├── relational-database-server/
│   └── init/
│       └── 001_init.sql
├── authentication-identity-server/ # (Cấu hình trực tiếp trong docker-compose)
├── object-storage-server/
│   └── data/                     # Volume lưu trữ bền vững cho MinIO
├── internal-dns-server/
│   ├── named.conf.options
│   ├── named.conf.local
│   └── db.cloud.local
├── monitoring-prometheus-server/
│   └── prometheus.yml
├── monitoring-grafana-dashboard-server/
└── api-gateway-proxy-server/
    └── nginx.conf
```

---

## 4. CHI TIẾT MÃ NGUỒN & CẤU HÌNH CƠ BẢN (5 ĐIỂM ĐẦU)

### 4.1. Khởi tạo khung thư mục
```bash
mkdir -p NhomSominiclouddemo/{web-frontend-server/html/blog,application-backend-server,relational-database-server/init,authentication-identity-server,object-storage-server/data,internal-dns-server,monitoring-prometheus-server,monitoring-grafana-dashboard-server,api-gateway-proxy-server}
cd NhomSominiclouddemo
```

### 4.2. Chi tiết các file cấu hình

#### 1) Web Frontend Server (`web-frontend-server/`)
* **`html/index.html`**:
  ```html
  <h1>MyMiniCloud – Home</h1><a href="/blog/">Blog</a>
  ```
* **`html/blog/index.html`**:
  ```html
  <h1>MyMiniCloud Blog</h1><a href="/">Back</a>
  ```
* **`conf.default`** *(Chú ý dấu `/` ở cuối `alias`)*:
  ```nginx
  server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    location / {
      try_files $uri $uri/ =404;
    }

    location ^~ /blog/ {
      alias /usr/share/nginx/html/blog/;
      index index.html;
      autoindex off;
    }
  }
  ```
* **`Dockerfile`**:
  ```dockerfile
  FROM nginx:stable
  RUN rm -f /etc/nginx/conf.d/default.conf
  COPY conf.default /etc/nginx/conf.d/default.conf
  COPY html/ /usr/share/nginx/html/
  RUN chmod -R 755 /usr/share/nginx/html
  EXPOSE 80
  CMD ["nginx","-g","daemon off;"]
  ```

#### 2) Application Backend Server (`application-backend-server/`)
* **`app.py`**:
  ```python
  from flask import Flask, jsonify, request
  import time, requests, os
  from jose import jwt

  ISSUER   = os.getenv("OIDC_ISSUER", "http://authentication-identity-server:8080/realms/master")
  AUDIENCE = os.getenv("OIDC_AUDIENCE", "myapp")
  JWKS_URL = f"{ISSUER}/protocol/openid-connect/certs"

  _JWKS = None; _TS = 0
  def get_jwks():
      global _JWKS, _TS
      now = time.time()
      if not _JWKS or now - _TS > 600:
          _JWKS = requests.get(JWKS_URL, timeout=5).json()
          _TS = now
      return _JWKS

  app = Flask(__name__)

  @app.get("/hello")
  def hello():
      return jsonify(message="Hello from App Server!")

  @app.get("/secure")
  def secure():
      auth = request.headers.get("Authorization","")
      if not auth.startswith("Bearer "):
          return jsonify(error="Missing Bearer token"), 401
      token = auth.split(" ",1)[1]
      try:
          payload = jwt.decode(token, get_jwks(), algorithms=["RS256"], audience=AUDIENCE, issuer=ISSUER)
          return jsonify(message="Secure resource OK", preferred_username=payload.get("preferred_username"))
      except Exception as e:
          return jsonify(error=str(e)), 401

  if __name__ == "__main__":
      app.run(host="0.0.0.0", port=8081)
  ```
* **`Dockerfile`**:
  ```dockerfile
  FROM python:3.11-alpine
  WORKDIR /app
  COPY app.py .
  RUN pip install --no-cache-dir flask requests python-jose
  EXPOSE 8081
  CMD ["python","app.py"]
  ```

#### 3) Relational Database Server (`relational-database-server/`)
* **`init/001_init.sql`**:
  ```sql
  CREATE DATABASE IF NOT EXISTS minicloud;
  USE minicloud;
  CREATE TABLE IF NOT EXISTS notes(
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  INSERT INTO notes(title) VALUES ('Hello from MariaDB!');
  ```

#### 6) Internal DNS Server (`internal-dns-server/`)
* **`named.conf.options`**:
  ```bind
  options {
    directory "/var/cache/bind";
    allow-query { any; };
    recursion yes;
  };
  ```
* **`named.conf.local`**:
  ```bind
  zone "cloud.local" IN {
    type master;
    file "/etc/bind/db.cloud.local";
  };
  ```
* **`db.cloud.local`**:
  ```bind
  $TTL 1H
  @   IN SOA  ns.cloud.local. admin.cloud.local. ( 1 1H 15M 1W 1H )
      IN NS   ns.cloud.local.
  ns  IN A    127.0.0.1
  web-frontend-server IN A 10.10.10.10
  ```

#### 7) Monitoring Prometheus Server (`monitoring-prometheus-server/`)
* **`prometheus.yml`**:
  ```yaml
  global:
    scrape_interval: 15s
  scrape_configs:
    - job_name: 'node'
      static_configs:
        - targets: ['monitoring-node-exporter-server:9100']
  ```

#### 9) API Gateway / Reverse Proxy (`api-gateway-proxy-server/`)
* **`nginx.conf`**:
  ```nginx
  events {}
  http {
    server {
      listen 80;

      # Web tĩnh
      location / {
        proxy_pass http://web-frontend-server:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
      }

      # App API (strip /api/)
      location /api/ {
        proxy_pass http://application-backend-server:8081/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
      }

      # Keycloak
      location /auth/ {
        proxy_pass http://authentication-identity-server:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
      }
    }
  }
  ```

#### 10) File `docker-compose.yml` tổng thể
```yaml
networks:
  cloud-net:
    name: cloud-net

services:
  web-frontend-server:
    build: ./web-frontend-server
    image: hotensv/web:dev
    container_name: web-frontend-server
    networks: [cloud-net]
    ports: [ "8080:80" ]
    restart: unless-stopped

  application-backend-server:
    build: ./application-backend-server
    image: hotensv/app:dev
    container_name: application-backend-server
    networks: [cloud-net]
    ports: [ "8085:8081" ]
    environment:
      OIDC_ISSUER: "http://authentication-identity-server:8080/realms/master"
      OIDC_AUDIENCE: "myapp"
    restart: unless-stopped

  relational-database-server:
    image: mariadb:11
    container_name: relational-database-server
    environment:
      MARIADB_ROOT_PASSWORD: root
      MARIADB_DATABASE: minicloud
    volumes:
      - ./relational-database-server/init:/docker-entrypoint-initdb.d:ro
    ports: [ "3306:3306" ]
    networks: [cloud-net]
    restart: unless-stopped

  authentication-identity-server:
    image: quay.io/keycloak/keycloak:latest
    container_name: authentication-identity-server
    command: ["start-dev"]
    environment:
      KC_BOOTSTRAP_ADMIN_USERNAME: admin
      KC_BOOTSTRAP_ADMIN_PASSWORD: admin
      KC_HOSTNAME: "localhost"
      KC_HOSTNAME_STRICT: "false"
      KC_HTTP_ENABLED: "true"
    ports: [ "8081:8080" ]
    restart: unless-stopped
    networks: [cloud-net]

  object-storage-server:
    image: minio/minio
    container_name: object-storage-server
    command: ["server","/data","--console-address",":9001"]
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - ./object-storage-server/data:/data
    ports: [ "9000:9000", "9001:9001" ]
    networks: [cloud-net]
    restart: unless-stopped

  internal-dns-server:
    image: internetsystemsconsortium/bind9:9.18
    container_name: internal-dns-server
    ports: [ "1053:53/udp" ]
    volumes:
      - ./internal-dns-server/named.conf.options:/etc/bind/named.conf.options:ro
      - ./internal-dns-server/named.conf.local:/etc/bind/named.conf.local:ro
      - ./internal-dns-server/db.cloud.local:/etc/bind/db.cloud.local:ro
    networks: [cloud-net]
    restart: unless-stopped

  monitoring-node-exporter-server:
    image: prom/node-exporter:latest
    container_name: monitoring-node-exporter-server
    ports: [ "9100:9100" ]
    networks: [cloud-net]
    restart: unless-stopped

  monitoring-prometheus-server:
    image: prom/prometheus:latest
    container_name: monitoring-prometheus-server
    ports: [ "9090:9090" ]
    volumes:
      - ./monitoring-prometheus-server/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    networks: [cloud-net]
    restart: unless-stopped

  monitoring-grafana-dashboard-server:
    image: grafana/grafana:latest
    container_name: monitoring-grafana-dashboard-server
    ports: [ "3000:3000" ]
    networks: [cloud-net]
    restart: unless-stopped

  api-gateway-proxy-server:
    image: nginx:stable
    container_name: api-gateway-proxy-server
    depends_on:
      - web-frontend-server
      - application-backend-server
      - authentication-identity-server
    ports: [ "80:80" ]
    volumes:
      - ./api-gateway-proxy-server/nginx.conf:/etc/nginx/nginx.conf:ro
    networks: [cloud-net]
    restart: unless-stopped
```

---

## 5. KỊCH BẢN KHỞI ĐỘNG & KIỂM THỬ CƠ BẢN (5 ĐIỂM)

### 5.1. Lệnh khởi tạo & chạy hệ thống
```bash
# Dọn dẹp container cũ nếu cần
docker rm -f $(docker ps -aq)

# Build và chạy hệ thống
docker compose build --no-cache
docker compose up -d
docker compose ps
```

### 5.2. Checklist kiểm thử 10 bước cơ bản
1. **Web Server:**
   * Lệnh: `curl -I http://localhost:8080/` và `curl -I http://localhost:8080/blog/`
   * Kỳ vọng: `HTTP/1.1 200 OK`, hiển thị đúng nội dung HTML.
2. **App Server:**
   * Lệnh: `curl http://localhost:8085/hello` và `curl http://localhost/api/hello`
   * Kỳ vọng: Trả về JSON `{"message":"Hello from App Server!"}`.
3. **Database Server:**
   * Lệnh: 
     ```bash
     docker run -it --rm --network cloud-net mysql:8 sh -lc 'mysql -h relational-database-server -uroot -proot -e "USE minicloud; SHOW TABLES; SELECT * FROM notes;"'
     ```
     *(Lưu ý: Thay `-h db` bằng `-h relational-database-server` theo đúng `container_name`)*.
   * Kỳ vọng: Có bảng `notes` và bản ghi `Hello from MariaDB!`.
4. **Auth Server (Keycloak):**
   * Truy cập `http://localhost:8081`, đăng nhập `admin` / `admin`.
   * Kỳ vọng: Vào được Admin Console, tạo được user test (`sv01`).
5. **Object Storage (MinIO):**
   * Truy cập `http://localhost:9001`, đăng nhập `minioadmin` / `minioadmin`.
   * Kỳ vọng: Tạo được bucket `demo` (hoặc `test1`) và upload thành công file `index.html`.
6. **Internal DNS Server (Bind9):**
   * Lệnh: `dig @127.0.0.1 -p 1053 web-frontend-server.cloud.local +short`
   * Kỳ vọng: Trả về `10.10.10.10`.
7. **Monitoring (Prometheus + Node Exporter):**
   * Truy cập `http://localhost:9090` -> **Status -> Targets**.
   * Kỳ vọng: `monitoring-node-exporter-server:9100` ở trạng thái **UP**. Truy vấn `node_cpu_seconds_total` ra đồ thị.
8. **Visualization (Grafana):**
   * Truy cập `http://localhost:3000`, đăng nhập `admin` / `admin`.
   * Add Datasource -> Prometheus -> URL: `http://monitoring-prometheus-server:9090` (hoặc `http://prometheus:9090` tùy tên container).
   * Import dashboard "Node Exporter Full" (ID: `1860`), hiển thị metric CPU/RAM/Network.
9. **API Gateway / Reverse Proxy:**
   * Lệnh:
     * `curl -I http://localhost/` -> `200 OK`
     * `curl -s http://localhost/api/hello` -> JSON từ backend
     * `curl -I http://localhost/auth/` -> Phản hồi từ Keycloak.
10. **Kiểm tra thông mạng nội bộ (Ping test):**
    * Vào container proxy: `docker exec -it api-gateway-proxy-server sh` (cài `iputils-ping` nếu thiếu) và ping tới tất cả các container khác bằng tên container/service. Kỳ vọng: `0% packet loss`.

---

## 6. YÊU CẦU MỞ RỘNG (5 ĐIỂM NÂNG CAO - "CLOUD APP INTEGRATION PRACTICE")

> **Hướng dẫn cho Agent:** Khi người dùng yêu cầu làm phần mở rộng để lấy điểm tối đa (10 điểm), hãy thực hiện 10 nâng cấp dưới đây (mỗi mục 0.5 điểm):

### Mở rộng 1: Web Frontend Server (0.5đ)
* **Yêu cầu:** Tạo blog cá nhân trong `/blog/` với ít nhất 3 bài viết HTML (`blog1.html`, `blog2.html`, `blog3.html`) theo chủ đề tự chọn (VD: Khoa học, Du lịch, Ẩm thực).
* **Kỹ thuật:** 
  * Mỗi bài có hình ảnh minh họa, giao diện đẹp (responsive/modern UI) và nút quay lại trang chính.
  * Cập nhật `/blog/index.html` và `/index.html` có danh sách bài viết kèm hyperlink điều hướng.

### Mở rộng 2: Application Backend Server - JSON API (0.5đ)
* **Yêu cầu:** Bổ sung API `/student` trả về danh sách sinh viên từ file JSON.
* **Kỹ thuật:**
  * Tạo file `application-backend-server/students.json` chứa 5 sinh viên (`id`, `name`, `major`, `gpa`).
  * Nhớ `COPY students.json .` trong `Dockerfile` của `application-backend-server`.
  * Thêm route trong `app.py`:
    ```python
    import json
    @app.get("/student")
    def student():
        with open("students.json", encoding="utf-8") as f:
            data = json.load(f)
        return jsonify(data)
    ```
  * Kiểm thử qua proxy: `http://localhost/api/student` (hoặc render kèm giao diện bảng HTML đẹp mắt).

### Mở rộng 3: Relational Database Server & Backend DB Connection (0.5đ)
* **Yêu cầu:** Tạo CSDL mới tên `studentdb` với bảng `students` và kết nối từ Flask App để đọc dữ liệu.
* **Kỹ thuật:**
  * Cập nhật `001_init.sql` (hoặc tạo `002_studentdb.sql` trong `init/`):
    ```sql
    CREATE DATABASE IF NOT EXISTS studentdb;
    USE studentdb;
    CREATE TABLE IF NOT EXISTS students (
      id INT PRIMARY KEY AUTO_INCREMENT,
      student_id VARCHAR(10),
      fullname VARCHAR(100),
      dob DATE,
      major VARCHAR(50)
    );
    INSERT INTO students (student_id, fullname, dob, major) VALUES
    ('SV001', 'Nguyen Van A', '2002-03-15', 'Computer Science'),
    ('SV002', 'Tran Thi B', '2001-11-02', 'Data Science'),
    ('SV003', 'Le Van C', '2002-07-20', 'Cybersecurity');
    ```
  * Cài thêm thư viện `pymysql` hoặc `mysql-connector-python` vào `application-backend-server/Dockerfile`.
  * Thêm route `/students-db` trong `app.py` kết nối tới `relational-database-server` (user `root`, pass `root`, db `studentdb`) để thực hiện truy vấn `SELECT * FROM students` (kèm các thao tác CRUD: SELECT, UPDATE, DELETE).
  * Kiểm thử tại: `http://localhost/api/students-db`.

### Mở rộng 4: Authentication Identity Server - Keycloak OIDC (0.5đ)
* **Yêu cầu:** Tạo Realm mới theo mã sinh viên (VD: `realm_sv001`).
* **Kỹ thuật:**
  * Tạo 2 user: `sv01`, `sv02` (cài đặt password không temporary).
  * Tạo 1 client: `flask-app` (Access Type: `public`, bật Direct Access Grants).
  * Cập nhật `OIDC_ISSUER` và `OIDC_AUDIENCE` của `application-backend-server` tương ứng với realm mới.
  * Lấy Access Token từ token endpoint của Keycloak bằng `curl` (POST) và gọi thử `curl -H "Authorization: Bearer <TOKEN>" http://localhost/api/secure`.

### Mở rộng 5: Object Storage Server - MinIO (0.5đ)
* **Yêu cầu:** Quản lý nhiều bucket và phân quyền truy cập.
* **Kỹ thuật:**
  * Tạo bucket `profile-pics` -> Upload ảnh đại diện `avatar.jpg` -> Bật policy Public/Share và lấy URL kiểm tra truy cập trực tiếp.
  * Tạo bucket `documents` -> Upload file PDF báo cáo.

### Mở rộng 6: Internal DNS Server - Bind9 (0.5đ)
* **Yêu cầu:** Mở rộng các bản ghi trong zone `db.cloud.local`.
* **Kỹ thuật:**
  * Thêm các bản ghi `A` vào `internal-dns-server/db.cloud.local`:
    ```bind
    app-backend   IN A 10.10.10.20
    minio         IN A 10.10.10.30
    keycloak      IN A 10.10.10.40
    ```
  * Tăng số `Serial` trong SOA, restart container `internal-dns-server` và dùng `dig @127.0.0.1 -p 1053 app-backend.cloud.local +short` để xác minh.

### Mở rộng 7: Monitoring Prometheus Server (0.5đ)
* **Yêu cầu:** Thêm scrape target mới để giám sát `web-frontend-server`.
* **Kỹ thuật:**
  * Bổ sung vào `monitoring-prometheus-server/prometheus.yml`:
    ```yaml
    - job_name: 'web'
      static_configs:
        - targets: ['web-frontend-server:80']
    ```
  * Restart Prometheus và mở `http://localhost:9090/targets` xác nhận job `web` hiển thị **UP**.

### Mở rộng 8: Grafana Dashboard (0.5đ)
* **Yêu cầu:** Tạo Dashboard cá nhân tên `System Health of <MSSV>`.
* **Kỹ thuật:**
  * Tạo ít nhất 3 biểu đồ (Panels) với Datasource là Prometheus:
    1. **CPU Usage (%):** Sử dụng metric `node_cpu_seconds_total`
    2. **Memory Usage:** Sử dụng metric `node_memory_MemAvailable_bytes`
    3. **Network Traffic:** Sử dụng metric `node_network_receive_bytes_total`
  * Lưu lại Dashboard.

### Mở rộng 9: API Gateway Proxy Server - Route Mapping (0.5đ)
* **Yêu cầu:** Cấu hình thêm route `/student/` trên Nginx Proxy trỏ thẳng tới API `/student` của Backend.
* **Kỹ thuật:**
  * Thêm vào `api-gateway-proxy-server/nginx.conf`:
    ```nginx
    location /student/ {
      proxy_pass http://application-backend-server:8081/student;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
    }
    ```
  * Restart proxy (`docker restart api-gateway-proxy-server`) và test `curl http://localhost/student/`.

### Mở rộng 10: Load Balancer Test - Round Robin (0.5đ)
* **Yêu cầu:** Cân bằng tải giữa 2 Web Server (`web-frontend-server1` và `web-frontend-server2`) bằng thuật toán **Round Robin**.
* **Kỹ thuật:**
  * Trong `docker-compose.yml`, nhân bản hoặc tạo 2 service web: `web-frontend-server1` và `web-frontend-server2` (có thể chỉnh nội dung `index.html` của mỗi server khác nhau đôi chút, ví dụ "Server 1" và "Server 2" để dễ nhìn kết quả luân phiên).
  * Trong `api-gateway-proxy-server/nginx.conf`, khai báo khối `upstream`:
    ```nginx
    upstream web_backend {
      server web-frontend-server1:80;
      server web-frontend-server2:80;
    }
    ```
  * Sửa `location /` để `proxy_pass http://web_backend;`.
  * Chạy `curl http://localhost/` nhiều lần liên tiếp, kết quả phải trả về luân phiên giữa Server 1 và Server 2.

---

## 7. YÊU CẦU TRIỂN KHAI PRODUCTION & BÁO CÁO CUỐI KỲ

### 7.1. Yêu cầu kỹ thuật bắt buộc khác
1. **Docker Hub:** Tag và push ít nhất 1 custom image lên Docker Hub cá nhân (VD: `docker push <username>/myminicloud-web:latest`).
2. **AWS EC2 Deployment:** 
   * Khởi tạo máy chủ Ubuntu trên AWS EC2.
   * Cấu hình Security Group mở các port cần thiết (`80`, `8080`, `8081`, `8085`, `9000`, `9001`, `9090`, `3000`, `1053/udp`).
   * Clone/copy project lên EC2, chạy `docker compose up -d` và kiểm thử qua **Public IP** của EC2.

### 7.2. Cấu trúc Báo cáo cuối kỳ (5 Chương + Phụ lục)
Khi hỗ trợ người dùng viết báo cáo, Agent cần bám sát bố cục sau:
* **Chương 1. Giới thiệu & Mục tiêu:** Giải thích hệ thống 9 server, mô hình cloud mô phỏng.
* **Chương 2. Kiến trúc & Sơ đồ:** Sơ đồ network (`cloud-net`), luồng request (flow) giữa các server.
* **Chương 3. Cấu hình & Dockerfile:** Trình bày chi tiết các `Dockerfile`, `docker-compose.yml`, và các file config (`nginx.conf`, `prometheus.yml`, `db.cloud.local`,...).
* **Chương 4. Demo & Kiểm thử:** Hướng dẫn lệnh chạy, kết quả thực thi và vị trí chèn ảnh minh họa cho từng server (cả phần cơ bản 5đ và ghi rõ đã làm bao nhiêu mục trong phần mở rộng 5đ).
* **Chương 5. Đánh giá & Phân tích:** Nêu ưu điểm, khó khăn gặp phải (ví dụ: xung đột tên container, cấu hình Keycloak đường dẫn `/auth`, quyền đọc file Bind9/Nginx) và hướng mở rộng trong tương lai.
* **Phụ lục:** Link Docker Hub, link video demo, log kết quả.