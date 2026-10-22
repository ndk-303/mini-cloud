# Student Blog Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nâng cấp MyMiniCloud thành Student Blog Platform với phân quyền Admin/Student qua Keycloak JWT, tính năng CRUD blog có upload ảnh lên SeaweedFS, và giao diện SPA Bootstrap 5.

**Architecture:** Flask backend bổ sung Blog API + middleware JWT; MariaDB thêm bảng `blogs`; Web Frontend thay thế HTML tĩnh bằng SPA (index.html + JS modules); toàn bộ chạy trên hạ tầng 9 container Docker hiện có — không thêm container mới.

**Tech Stack:** Python/Flask, MariaDB (pymysql), boto3 (S3 SeaweedFS), python-jose (JWT), HTML5 + Bootstrap 5.3 CDN + Vanilla JS ES6 Modules, Nginx (tĩnh + proxy).

**Spec:** `docs/superpowers/specs/2026-10-22-student-blog-platform-design.md`

## Global Constraints

- Giữ nguyên tất cả endpoint hiện có: `/hello`, `/secure`, `/student`, `/students-db` (GET/PUT/DELETE).
- Database `studentdb`, bảng `students` không thay đổi schema.
- Flask chạy port `8081` trong container, expose ra `:8085` qua Docker Compose.
- Nginx Reverse Proxy: `/api/*` → Flask, `/auth/*` → Keycloak, `/` → web_backend (Round-Robin).
- Web Frontend: file tĩnh, không cần build tool, chạy trên Nginx `:80`.
- Keycloak realm: `master`; client: `flask-app`; Direct Access Grants enabled.
- Tài khoản mẫu sinh viên: `SV001`–`SV005`, password `student123`, role `student`.
- SeaweedFS S3 endpoint nội bộ: `http://object-storage-server:9000`.
- Flask Dockerfile: `FROM python:3.11-alpine`; không đổi base image.
- Tất cả response API trả về JSON; CORS headers cho phép `*`.

## Review Focus

- **JWT hết hạn:** Frontend cần bắt lỗi 401 từ API và tự động hiển thị lại login modal thay vì trang trắng.
- **Upload ảnh không bắt buộc:** Form tạo blog phải submit được khi không có file ảnh đính kèm; `image_url` = null là hợp lệ.
- **Race condition SeaweedFS:** Nếu SeaweedFS chưa sẵn sàng khi Flask khởi động, `/api/upload` phải trả lỗi 503 rõ ràng thay vì crash.
- **Author ownership check:** `PUT/DELETE /api/blogs/<id>` phải reject đúng khi sinh viên A cố sửa blog của sinh viên B, ngay cả khi token hợp lệ.
- **Admin thêm SV mới:** `POST /api/students-db` là endpoint mới; phải validate `student_id` không bị trùng trước khi INSERT.

---

## Task 1: Database Migration – Bảng `blogs`

**Files:**
- Create: `db/init/003_blogs.sql`

**Interfaces:**
- Produces: Bảng `blogs(id INT PK AUTO_INCREMENT, title VARCHAR(200) NOT NULL, content TEXT NOT NULL, author_id VARCHAR(10) NOT NULL, image_url VARCHAR(500), created_at DATETIME, updated_at DATETIME)` trong database `studentdb`.

- [ ] **Step 1: Viết file migration SQL**

Tạo `db/init/003_blogs.sql`:
```sql
USE studentdb;

CREATE TABLE IF NOT EXISTS blogs (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  title      VARCHAR(200) NOT NULL,
  content    TEXT         NOT NULL,
  author_id  VARCHAR(10)  NOT NULL,
  image_url  VARCHAR(500),
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
  INDEX idx_author (author_id)
);

INSERT INTO blogs (title, content, author_id, image_url) VALUES
  ('Docker Deep Dive', 'Docker revolutionized how we ship software by packaging applications and their dependencies into lightweight, portable containers.', 'SV001', NULL),
  ('Introduction to Kubernetes', 'Kubernetes (K8s) is an open-source container orchestration system for automating deployment, scaling, and management of containerized applications.', 'SV002', NULL),
  ('Cloud Native Architecture', 'Cloud native technologies empower organizations to build and run scalable applications in modern, dynamic environments such as public, private, and hybrid clouds.', 'SV003', NULL);
```

- [ ] **Step 2: Apply migration thủ công vào container MariaDB đang chạy**

```bash
docker exec -i relational-database-server mariadb -uroot -proot < db/init/003_blogs.sql
```

Expected: Không có lỗi. Kiểm tra:
```bash
docker exec relational-database-server mariadb -uroot -proot studentdb -e "SHOW TABLES; SELECT COUNT(*) FROM blogs;"
```
Expected: Thấy bảng `blogs` và COUNT = 3.

- [ ] **Step 3: Commit**

```bash
git add db/init/003_blogs.sql
git commit -m "feat(db): add blogs table migration with sample data"
```

---

## Task 2: Flask – Middleware Auth & Blog API

**Files:**
- Modify: `app/app.py` (toàn bộ file, thêm imports, decorators, endpoints mới)
- Modify: `app/Dockerfile` (thêm `boto3` vào pip install)

**Interfaces:**
- Consumes: Bảng `blogs` từ Task 1; Keycloak JWKS từ `OIDC_ISSUER`; SeaweedFS S3 endpoint.
- Produces:
  - `require_role(role: str)` → decorator, trả `(401, {error})` hoặc `(403, {error})` hoặc truyền `g.token_payload` vào handler.
  - `require_auth` → decorator, set `g.token_payload`, trả `(401, {error})` nếu thiếu token.
  - `GET /blogs` → `[{id, title, author_id, image_url, created_at}]` (không có `content`).
  - `GET /blogs/<id>` → `{id, title, content, author_id, image_url, created_at, updated_at}`.
  - `POST /blogs` → body `{title, content, image_url?}`, trả `{id, title, author_id}`.
  - `PUT /blogs/<id>` → body `{title?, content?, image_url?}`, trả `{updated: id}`.
  - `DELETE /blogs/<id>` → trả `{deleted: id}`.
  - `POST /upload` → multipart field `file`, trả `{url: str}`.
  - `POST /students-db` → body `{student_id, fullname, dob, major}`, trả `{id, student_id}`.

- [ ] **Step 1: Thêm import và biến cấu hình S3 vào đầu `app.py`**

Thêm vào sau dòng `import pymysql.cursors`:
```python
from flask import g
from functools import wraps
import boto3
from botocore.client import Config

S3_ENDPOINT  = os.getenv("S3_ENDPOINT",  "http://object-storage-server:9000")
S3_BUCKET    = os.getenv("S3_BUCKET",    "blog-images")
S3_ACCESS    = os.getenv("S3_ACCESS_KEY","admin")
S3_SECRET    = os.getenv("S3_SECRET_KEY","password")

def get_s3():
    return boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=S3_ACCESS,
        aws_secret_access_key=S3_SECRET,
        config=Config(signature_version="s3v4"),
        region_name="us-east-1"
    )
```

- [ ] **Step 2: Thêm decorator `require_role` và `require_auth`**

Thêm sau hàm `get_db()`, trước `app = Flask(__name__)`:
```python
def _decode_token():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None, (jsonify(error="Missing Bearer token"), 401)
    token = auth.split(" ", 1)[1]
    try:
        claims = jwt.get_unverified_claims(token)
        issuer = claims.get("iss", ISSUER)
        jwks = get_jwks(issuer)
        payload = jwt.decode(token, jwks, algorithms=["RS256"],
                             issuer=issuer, options={"verify_aud": False})
        return payload, None
    except Exception as e:
        return None, (jsonify(error=str(e)), 401)

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        payload, err = _decode_token()
        if err:
            return err
        g.token_payload = payload
        return f(*args, **kwargs)
    return decorated

def require_role(role):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            payload, err = _decode_token()
            if err:
                return err
            roles = payload.get("realm_access", {}).get("roles", [])
            if role not in roles:
                return jsonify(error=f"Role '{role}' required"), 403
            g.token_payload = payload
            return f(*args, **kwargs)
        return decorated
    return decorator
```

- [ ] **Step 3: Thêm `POST /students-db` vào nhóm MariaDB CRUD hiện có**

Thêm vào `app.py` sau endpoint `DELETE /students-db/<id>`:
```python
@app.post("/students-db")
@require_role("admin")
def students_db_create():
    data = request.get_json(force=True)
    required = ("student_id", "fullname", "dob", "major")
    if not all(k in data for k in required):
        return jsonify(error="Missing required fields"), 400
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM students WHERE student_id=%s", (data["student_id"],))
            if cur.fetchone():
                return jsonify(error="student_id already exists"), 409
            cur.execute(
                "INSERT INTO students (student_id, fullname, dob, major) VALUES (%s,%s,%s,%s)",
                (data["student_id"], data["fullname"], data["dob"], data["major"])
            )
        conn.commit()
        return jsonify(id=conn.insert_id(), student_id=data["student_id"]), 201
```

- [ ] **Step 4: Bảo vệ các endpoint students-db hiện có bằng `@require_role("admin")`**

Thêm decorator `@require_role("admin")` vào 3 hàm hiện có:
- `students_db_list()` (GET `/students-db`)
- `students_db_get(sid)` (GET `/students-db/<id>`)
- `students_db_update(sid)` (PUT `/students-db/<id>`)
- `students_db_delete(sid)` (DELETE `/students-db/<id>`)

- [ ] **Step 5: Thêm Blog API endpoints**

Thêm section mới vào `app.py`:
```python
# ── Blog API ─────────────────────────────────────────────────────────────────

@app.get("/blogs")
def blogs_list():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, title, author_id, image_url,
                       DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at
                FROM blogs ORDER BY created_at DESC
            """)
            return jsonify(cur.fetchall())

@app.get("/blogs/<int:bid>")
def blogs_get(bid):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, title, content, author_id, image_url,
                       DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at,
                       DATE_FORMAT(updated_at,'%Y-%m-%dT%H:%i:%sZ') AS updated_at
                FROM blogs WHERE id=%s
            """, (bid,))
            row = cur.fetchone()
    return jsonify(row) if row else (jsonify(error="Not found"), 404)

@app.post("/blogs")
@require_auth
def blogs_create():
    data = request.get_json(force=True)
    if not data.get("title") or not data.get("content"):
        return jsonify(error="title and content required"), 400
    author_id = g.token_payload.get("preferred_username")
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO blogs (title, content, author_id, image_url) VALUES (%s,%s,%s,%s)",
                (data["title"], data["content"], author_id, data.get("image_url"))
            )
        conn.commit()
        new_id = conn.insert_id()
    return jsonify(id=new_id, title=data["title"], author_id=author_id), 201

@app.put("/blogs/<int:bid>")
@require_auth
def blogs_update(bid):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT author_id FROM blogs WHERE id=%s", (bid,))
            row = cur.fetchone()
    if not row:
        return jsonify(error="Not found"), 404
    payload = g.token_payload
    roles   = payload.get("realm_access", {}).get("roles", [])
    username = payload.get("preferred_username")
    if row["author_id"] != username and "admin" not in roles:
        return jsonify(error="Forbidden"), 403
    data  = request.get_json(force=True)
    valid = {k: v for k, v in data.items() if k in ("title", "content", "image_url")}
    if not valid:
        return jsonify(error="No valid fields"), 400
    set_clause = ", ".join(f"{k}=%s" for k in valid)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(f"UPDATE blogs SET {set_clause} WHERE id=%s", (*valid.values(), bid))
        conn.commit()
    return jsonify(updated=bid)

@app.delete("/blogs/<int:bid>")
@require_auth
def blogs_delete(bid):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT author_id FROM blogs WHERE id=%s", (bid,))
            row = cur.fetchone()
    if not row:
        return jsonify(error="Not found"), 404
    payload  = g.token_payload
    roles    = payload.get("realm_access", {}).get("roles", [])
    username = payload.get("preferred_username")
    if row["author_id"] != username and "admin" not in roles:
        return jsonify(error="Forbidden"), 403
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM blogs WHERE id=%s", (bid,))
        conn.commit()
    return jsonify(deleted=bid)
```

- [ ] **Step 6: Thêm `/upload` endpoint**

```python
# ── Upload Image ─────────────────────────────────────────────────────────────

@app.post("/upload")
@require_auth
def upload_image():
    if "file" not in request.files:
        return jsonify(error="No file field"), 400
    f = request.files["file"]
    if not f.filename:
        return jsonify(error="Empty filename"), 400
    try:
        s3 = get_s3()
        # Đảm bảo bucket tồn tại
        try:
            s3.head_bucket(Bucket=S3_BUCKET)
        except Exception:
            s3.create_bucket(Bucket=S3_BUCKET)
        key = f"blog/{os.urandom(8).hex()}_{f.filename}"
        s3.upload_fileobj(f, S3_BUCKET, key,
                          ExtraArgs={"ContentType": f.content_type or "application/octet-stream"})
        url = f"{S3_ENDPOINT}/{S3_BUCKET}/{key}"
        return jsonify(url=url)
    except Exception as e:
        return jsonify(error=f"Upload failed: {e}"), 503
```

- [ ] **Step 7: Thêm CORS headers**

Thêm sau `app = Flask(__name__)`:
```python
@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    return response

@app.route("/<path:p>", methods=["OPTIONS"])
@app.route("/", methods=["OPTIONS"])
def options_handler(p=""):
    return add_cors(app.make_response("")), 204
```

- [ ] **Step 8: Cập nhật `app/Dockerfile` — thêm boto3**

Sửa dòng pip install:
```dockerfile
RUN pip install --no-cache-dir flask requests python-jose pymysql boto3
```

- [ ] **Step 9: Build lại và test thủ công Flask**

```bash
docker compose build application-backend-server
docker compose up -d application-backend-server
# Test public blog endpoint
curl http://localhost:8085/blogs
# Expected: JSON array với 3 bài blog mẫu
curl http://localhost:8085/students-db
# Expected: {"error": "Missing Bearer token"} HTTP 401
```

- [ ] **Step 10: Commit**

```bash
git add app/app.py app/Dockerfile
git commit -m "feat(api): add blog CRUD, upload endpoint, JWT middleware, CORS"
```

---

## Task 3: Keycloak – Cấu hình Client & Users

**Files:**
- Không có file code; cấu hình thủ công qua Keycloak Admin Console.

**Interfaces:**
- Produces: Keycloak realm `master` có client `flask-app` (Direct Access Grants enabled), role `admin` và `student`, 6 user mẫu đã gán role.

- [ ] **Step 1: Mở Keycloak Admin Console**

Truy cập `http://localhost:8081`, đăng nhập `admin/admin`.

- [ ] **Step 2: Tạo Client `flask-app`**

Clients → Create client:
- Client ID: `flask-app`
- Client type: `OpenID Connect`
- Authentication flow: bật **Direct access grants**
- Save.

- [ ] **Step 3: Tạo Realm Roles**

Realm roles → Create role:
- Tạo role `admin`
- Tạo role `student`

- [ ] **Step 4: Tạo Users và gán Role**

Tạo 5 user sinh viên (lặp lại):
- Username: `SV001` / Credentials: `student123` / Temporary: OFF / Role mapping: `student`
- Username: `SV002` → `SV005`: tương tự

Tài khoản admin đã tồn tại; thêm role mapping `admin` vào user `admin`.

- [ ] **Step 5: Verify bằng curl**

```bash
curl -s -X POST http://localhost:8081/realms/master/protocol/openid-connect/token \
  -d "grant_type=password&client_id=flask-app&username=SV001&password=student123" \
  | python -m json.tool
```
Expected: JSON có `access_token`. Decode payload và kiểm tra `realm_access.roles` chứa `"student"`.

```bash
curl -s -X POST http://localhost:8081/realms/master/protocol/openid-connect/token \
  -d "grant_type=password&client_id=flask-app&username=admin&password=admin" \
  | python -m json.tool
```
Expected: `realm_access.roles` chứa `"admin"`.

---

## Task 4: Web Frontend – SPA Shell & Auth

**Files:**
- Overwrite: `web/html/index.html` ← Shell SPA chính
- Create: `web/html/api.js` ← HTTP client + Keycloak token endpoint
- Create: `web/html/app.js` ← Router + Auth state + Navbar

**Interfaces:**
- Produces:
  - `api.js` export: `login(username, password)→Promise<{token,username,role}>`, `authFetch(url, options)→Promise<Response>`, `apiFetch(url, options)→Promise<Response>`.
  - `app.js`: `navigate(hash)` function, `getAuth()→{token,username,role}|null`.
  - `index.html`: Bootstrap 5 Navbar với modal login, `<div id="app">` là container nội dung.

- [ ] **Step 1: Viết `web/html/api.js`**

```javascript
const KC_TOKEN_URL = '/auth/realms/master/protocol/openid-connect/token';
const API_BASE     = '/api';

export async function login(username, password) {
  const res = await fetch(KC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password', client_id: 'flask-app', username, password
    })
  });
  if (!res.ok) throw new Error('Invalid credentials');
  const { access_token } = await res.json();
  const payload = JSON.parse(atob(access_token.split('.')[1]));
  const role    = (payload.realm_access?.roles ?? []).includes('admin') ? 'admin' : 'student';
  return { token: access_token, username: payload.preferred_username, role };
}

export function getAuth() {
  const raw = sessionStorage.getItem('auth');
  return raw ? JSON.parse(raw) : null;
}

export function saveAuth(authObj) { sessionStorage.setItem('auth', JSON.stringify(authObj)); }
export function clearAuth()       { sessionStorage.removeItem('auth'); }

export async function apiFetch(path, options = {}) {
  const auth = getAuth();
  const headers = { 'Content-Type': 'application/json', ...(options.headers ?? {}) };
  if (auth) headers['Authorization'] = `Bearer ${auth.token}`;
  const res = await fetch(API_BASE + path, { ...options, headers });
  if (res.status === 401) { clearAuth(); window.location.hash = '#home'; }
  return res;
}

export async function uploadFile(file) {
  const auth = getAuth();
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(API_BASE + '/upload', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${auth?.token}` },
    body: fd
  });
  return res.json();
}
```

- [ ] **Step 2: Viết `web/html/app.js`**

```javascript
import { getAuth, saveAuth, clearAuth, login } from './api.js';

export function navigate(hash) { window.location.hash = hash; }
export { getAuth };

function renderNav() {
  const auth = getAuth();
  const navLinks = document.getElementById('nav-links');
  const navAuth  = document.getElementById('nav-auth');
  navLinks.innerHTML = `<li class="nav-item"><a class="nav-link" href="#home">Blog</a></li>`;
  if (auth) {
    navLinks.innerHTML += `<li class="nav-item"><a class="nav-link" href="#my-blogs">Blog của tôi</a></li>`;
    if (auth.role === 'admin')
      navLinks.innerHTML += `<li class="nav-item"><a class="nav-link" href="#admin">Quản lý SV</a></li>`;
    navAuth.innerHTML = `<span class="navbar-text me-3">${auth.username}</span>
      <button class="btn btn-outline-secondary btn-sm" id="btn-logout">Đăng xuất</button>`;
    document.getElementById('btn-logout')?.addEventListener('click', () => {
      clearAuth(); renderNav(); navigate('#home');
    });
  } else {
    navAuth.innerHTML = `<button class="btn btn-primary btn-sm" data-bs-toggle="modal" data-bs-target="#loginModal">Đăng nhập</button>`;
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  try {
    const auth = await login(username, password);
    saveAuth(auth);
    bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
    renderNav();
    navigate(auth.role === 'admin' ? '#admin' : '#home');
  } catch {
    errEl.textContent = 'Sai tên đăng nhập hoặc mật khẩu.';
    errEl.classList.remove('d-none');
  }
}

async function route() {
  const hash = window.location.hash || '#home';
  const appEl = document.getElementById('app');
  const [page, param] = hash.replace('#','').split('/');
  const auth = getAuth();

  const guards = { 'my-blogs': true, 'blog-form': true, 'admin': 'admin' };
  if (guards[page]) {
    if (!auth) { navigate('#home'); return; }
    if (guards[page] === 'admin' && auth.role !== 'admin') { navigate('#home'); return; }
  }

  const modules = {
    'home':        () => import('./pages/home.js'),
    'blog':        () => import('./pages/blog-detail.js'),
    'blog-form':   () => import('./pages/blog-form.js'),
    'my-blogs':    () => import('./pages/my-blogs.js'),
    'admin':       () => import('./pages/admin.js'),
  };
  const loader = modules[page] ?? modules['home'];
  const mod = await loader();
  appEl.innerHTML = '';
  mod.render(appEl, param);
}

document.addEventListener('DOMContentLoaded', () => {
  renderNav();
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  window.addEventListener('hashchange', () => { route(); renderNav(); });
  route();
});
```

- [ ] **Step 3: Viết `web/html/index.html`**

```html
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Student Blog – MyMiniCloud</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body>
<nav class="navbar navbar-expand-lg navbar-dark bg-dark">
  <div class="container">
    <a class="navbar-brand fw-bold" href="#home">📚 Student Blog</a>
    <div class="navbar-nav me-auto" id="nav-links"></div>
    <div id="nav-auth"></div>
  </div>
</nav>

<div class="container mt-4" id="app">
  <div class="text-center py-5"><div class="spinner-border"></div></div>
</div>

<!-- Login Modal -->
<div class="modal fade" id="loginModal" tabindex="-1">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Đăng nhập</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <div class="alert alert-danger d-none" id="login-error"></div>
        <form id="login-form">
          <div class="mb-3">
            <label class="form-label">Tên đăng nhập</label>
            <input type="text" class="form-control" id="login-username" required>
          </div>
          <div class="mb-3">
            <label class="form-label">Mật khẩu</label>
            <input type="password" class="form-control" id="login-password" required>
          </div>
          <button type="submit" class="btn btn-primary w-100">Đăng nhập</button>
        </form>
      </div>
    </div>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script type="module" src="./app.js"></script>
</body>
</html>
```

- [ ] **Step 4: Cập nhật `web/conf.default` — hỗ trợ JS modules và thư mục pages/**

Thêm vào trong `location /`:
```nginx
location / {
  try_files $uri $uri/ /index.html;
  add_header Cache-Control "no-cache";
}
```
Xóa location `/blog/` cũ (thay bằng SPA routing).

- [ ] **Step 5: Build và kiểm tra**

```bash
docker compose build web-frontend-server1 web-frontend-server2
docker compose up -d web-frontend-server1 web-frontend-server2
```
Mở `http://localhost` — thấy Navbar "Student Blog" và spinner.  
Bấm "Đăng nhập" — thấy modal form.

- [ ] **Step 6: Commit**

```bash
git add web/html/index.html web/html/api.js web/html/app.js web/conf.default
git commit -m "feat(web): SPA shell, navbar, auth modal, hash router"
```

---

## Task 5: Web Frontend – Trang Blog & Chi tiết bài viết

**Files:**
- Create: `web/html/pages/home.js`
- Create: `web/html/pages/blog-detail.js`

**Interfaces:**
- Consumes: `apiFetch` từ `../api.js`; `getAuth`, `navigate` từ `../app.js`.
- Produces: `export function render(container, param)` trên cả 2 module.

- [ ] **Step 1: Viết `web/html/pages/home.js`**

Render danh sách blog dạng Bootstrap cards (3 cột, responsive).  
Mỗi card: ảnh (nếu có `image_url`), tiêu đề, tác giả, ngày, nút "Đọc tiếp" → `navigate('#blog/' + id)`.  
Nút "✍️ Viết bài mới" hiện khi đã đăng nhập → `navigate('#blog-form')`.  
Gọi `GET /api/blogs` để lấy dữ liệu.

- [ ] **Step 2: Viết `web/html/pages/blog-detail.js`**

`render(container, id)`: Gọi `GET /api/blogs/<id>`.  
Hiển thị: tiêu đề (h1), ảnh (nếu có), nội dung (pre-wrap hoặc paragraphs), tác giả, ngày.  
Nếu đang đăng nhập và (`auth.username == blog.author_id` hoặc `auth.role == 'admin'`): hiện nút Sửa → `navigate('#blog-form/' + id)` và nút Xóa → gọi `DELETE /api/blogs/<id>` rồi `navigate('#home')`.  
Nút "← Quay lại" → `navigate('#home')`.

- [ ] **Step 3: Test thủ công**

Mở `http://localhost#home` → thấy 3 card blog mẫu.  
Click "Đọc tiếp" → thấy trang chi tiết với nội dung đầy đủ.

- [ ] **Step 4: Commit**

```bash
git add web/html/pages/home.js web/html/pages/blog-detail.js
git commit -m "feat(web): blog list and detail pages"
```

---

## Task 6: Web Frontend – Form viết/sửa blog

**Files:**
- Create: `web/html/pages/blog-form.js`

**Interfaces:**
- Consumes: `apiFetch`, `uploadFile` từ `../api.js`; `getAuth`, `navigate` từ `../app.js`.
- Produces: `export function render(container, id?)`.

- [ ] **Step 1: Viết `web/html/pages/blog-form.js`**

`render(container, id)`:
- Nếu `id` tồn tại: gọi `GET /api/blogs/<id>` để pre-fill form (chế độ sửa).
- Form gồm: input tiêu đề, textarea nội dung, input file ảnh (optional) với preview ảnh ngay khi chọn.
- Submit:
  1. Nếu có file ảnh: gọi `uploadFile(file)` → nhận `url`.
  2. Gọi `POST /api/blogs` (tạo mới) hoặc `PUT /api/blogs/<id>` (sửa) với `{title, content, image_url}`.
  3. Sau thành công: `navigate('#my-blogs')`.
- Nút "Hủy" → `navigate('#my-blogs')`.

- [ ] **Step 2: Test thủ công**

Đăng nhập SV001, bấm "Viết bài mới", điền form, submit không có ảnh → thấy bài mới ở trang chủ.  
Thử lại với ảnh đính kèm → ảnh hiển thị trong bài.

- [ ] **Step 3: Commit**

```bash
git add web/html/pages/blog-form.js
git commit -m "feat(web): blog create/edit form with image upload"
```

---

## Task 7: Web Frontend – Blog của tôi

**Files:**
- Create: `web/html/pages/my-blogs.js`

**Interfaces:**
- Consumes: `apiFetch`, `getAuth`, `navigate`.
- Produces: `export function render(container, param)`.

- [ ] **Step 1: Viết `web/html/pages/my-blogs.js`**

`render(container)`:
- Gọi `GET /api/blogs`, lọc phía client những bài có `author_id === auth.username` (nếu admin thì hiện tất cả).
- Render bảng Bootstrap (title, ngày, actions).
- Mỗi hàng: nút Sửa → `navigate('#blog-form/' + id)`, nút Xóa → confirm dialog → `DELETE /api/blogs/<id>` → reload.
- Nút "✍️ Viết bài mới" ở đầu trang.

- [ ] **Step 2: Test thủ công**

Đăng nhập SV001, mở "Blog của tôi" → chỉ thấy bài của SV001.  
Đăng nhập admin → thấy tất cả bài.

- [ ] **Step 3: Commit**

```bash
git add web/html/pages/my-blogs.js
git commit -m "feat(web): my-blogs page with personal blog management"
```

---

## Task 8: Web Frontend – Trang Quản lý Sinh viên (Admin)

**Files:**
- Create: `web/html/pages/admin.js`

**Interfaces:**
- Consumes: `apiFetch`, `getAuth`, `navigate`.
- Produces: `export function render(container, param)`.

- [ ] **Step 1: Viết `web/html/pages/admin.js`**

`render(container)`:
- Redirect về `#home` nếu không phải admin (double-check phía client).
- Gọi `GET /api/students-db` → render bảng Bootstrap responsive với cột: ID, MSSV, Họ tên, Ngày sinh, Ngành, Actions.
- Nút Thêm sinh viên → mở form inline (hoặc collapse) với các field `student_id`, `fullname`, `dob`, `major` → `POST /api/students-db`.
- Nút Sửa trên mỗi hàng → điền vào form trên → `PUT /api/students-db/<id>`.
- Nút Xóa → confirm → `DELETE /api/students-db/<id>` → reload bảng.

- [ ] **Step 2: Test thủ công**

Đăng nhập admin, mở "Quản lý SV" → thấy bảng 5 sinh viên.  
Thêm sinh viên mới `SV006` → xuất hiện trong bảng.  
Xóa `SV006` → biến mất.  
Đăng nhập SV001, truy cập `#admin` → bị redirect về `#home`.

- [ ] **Step 3: Rebuild web và smoke test tổng thể**

```bash
docker compose build web-frontend-server1 web-frontend-server2
docker compose up -d
```

Chạy full checklist:
- [ ] Khách thấy danh sách blog không cần đăng nhập.
- [ ] SV001 đăng nhập → viết bài, sửa bài của mình, không xóa được bài SV002.
- [ ] Admin xóa bài của SV002 thành công.
- [ ] Admin quản lý sinh viên CRUD.
- [ ] `curl http://localhost/api/students-db` → 401 (không token).
- [ ] `curl -H "Authorization: Bearer <token_SV001>" http://localhost/api/students-db` → 403.

- [ ] **Step 4: Commit**

```bash
git add web/html/pages/admin.js
git commit -m "feat(web): admin student management page"
```

---

## Task 9: Dọn dẹp & Cập nhật README

**Files:**
- Delete: `web/html/blog/blog1.html`, `blog2.html`, `blog3.html`, `web/html/blog/index.html`
- Delete: `web/html/index2.html`
- Modify: `web/html/index.html` ← đã xử lý ở Task 4 (giữ nguyên)
- Modify: `README.md`

**Interfaces:** Không có.

- [ ] **Step 1: Xóa các file HTML tĩnh cũ không còn dùng**

```bash
rm web/html/blog/blog1.html web/html/blog/blog2.html web/html/blog/blog3.html
rm web/html/blog/index.html web/html/index2.html
```

- [ ] **Step 2: Cập nhật `README.md`**

Cập nhật phần mô tả Web Frontend: thêm thông tin về Student Blog Platform, tài khoản mẫu, và cách test phân quyền.

- [ ] **Step 3: Commit cuối**

```bash
git add -A
git commit -m "chore: remove legacy static blog HTML, update README for student blog platform"
```
