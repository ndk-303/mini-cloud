from flask import Flask, jsonify, request, g
import time, requests, os, json
from urllib.parse import urlparse
from functools import wraps
from jose import jwt
import pymysql
import pymysql.cursors
import boto3
from botocore.client import Config

ISSUER   = os.getenv("OIDC_ISSUER",   "http://authentication-identity-server:8080/realms/master")
AUDIENCE = os.getenv("OIDC_AUDIENCE", "myapp")

S3_ENDPOINT  = os.getenv("S3_ENDPOINT",  "http://object-storage-server:9000")
S3_BUCKET    = os.getenv("S3_BUCKET",    "blog-images")
S3_ACCESS    = os.getenv("S3_ACCESS_KEY","admin")
S3_SECRET    = os.getenv("S3_SECRET_KEY","password")

_JWKS_CACHE = {}

def get_jwks(issuer_url):
    now = time.time()
    cached = _JWKS_CACHE.get(issuer_url)
    if not cached or now - cached["ts"] > 600:
        jwks_url = f"{issuer_url.rstrip('/')}/protocol/openid-connect/certs"
        # Chuẩn hóa URL nội bộ Keycloak: hỗ trợ cả localhost, proxy /auth/, và port 8081
        p = urlparse(jwks_url)
        path = p.path
        if path.startswith("/auth/"):
            path = path[5:]
        internal_url = f"http://authentication-identity-server:8080{path}"
        resp = requests.get(internal_url, timeout=5)
        _JWKS_CACHE[issuer_url] = {"data": resp.json(), "ts": now}
    return _JWKS_CACHE[issuer_url]["data"]

def get_db():
    return pymysql.connect(
        host=os.getenv("DB_HOST", "relational-database-server"),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", "root"),
        database=os.getenv("DB_NAME", "studentdb"),
        cursorclass=pymysql.cursors.DictCursor
    )

def get_s3():
    return boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=S3_ACCESS,
        aws_secret_access_key=S3_SECRET,
        config=Config(signature_version="s3v4"),
        region_name="us-east-1"
    )

def _decode_token():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None, (jsonify(error="Missing Bearer token"), 401)
    token = auth.split(" ", 1)[1]
    try:
        unverified_claims = jwt.get_unverified_claims(token)
        token_issuer = unverified_claims.get("iss", ISSUER)
        jwks = get_jwks(token_issuer)

        payload = jwt.decode(
            token, jwks,
            algorithms=["RS256"],
            issuer=token_issuer,
            options={"verify_aud": False}
        )
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

app = Flask(__name__)

# ── CORS Middleware ──────────────────────────────────────────────────────────

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

# ── Original endpoints ──────────────────────────────────────────────────────

@app.get("/hello")
def hello():
    return jsonify(message="Hello from App Server!")

@app.get("/secure")
def secure():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return jsonify(error="Missing Bearer token"), 401
    token = auth.split(" ", 1)[1]
    try:
        unverified_claims = jwt.get_unverified_claims(token)
        token_issuer = unverified_claims.get("iss", ISSUER)
        jwks = get_jwks(token_issuer)

        payload = jwt.decode(
            token, jwks,
            algorithms=["RS256"],
            issuer=token_issuer,
            options={"verify_aud": False}
        )
        return jsonify(
            message="Secure resource OK",
            preferred_username=payload.get("preferred_username"),
            realm=token_issuer.rstrip("/").split("/")[-1]
        )
    except Exception as e:
        return jsonify(error=str(e)), 401

@app.route("/student", methods=["GET"])
@app.route("/student/", methods=["GET"])
def student():
    with open("students.json", encoding="utf-8") as f:
        return jsonify(json.load(f))

# ── Extension 3 & Admin CRUD: MariaDB Students ──────────────────────────────

@app.get("/students-db")
@require_role("admin")
def students_db_list():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM students")
            return jsonify(cur.fetchall())

@app.get("/students-db/<int:sid>")
@require_role("admin")
def students_db_get(sid):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM students WHERE id = %s", (sid,))
            row = cur.fetchone()
    return jsonify(row) if row else (jsonify(error="Not found"), 404)

@app.post("/students-db")
@require_role("admin")
def students_db_create():
    data = request.get_json(force=True)
    required = ("student_id", "fullname", "dob", "major")
    if not all(k in data for k in required):
        return jsonify(error="Missing required fields"), 400
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM students WHERE student_id = %s", (data["student_id"],))
            if cur.fetchone():
                return jsonify(error="student_id already exists"), 409
            cur.execute(
                "INSERT INTO students (student_id, fullname, dob, major) VALUES (%s, %s, %s, %s)",
                (data["student_id"], data["fullname"], data["dob"], data["major"])
            )
            new_id = cur.lastrowid
        conn.commit()
    return jsonify(id=new_id, student_id=data["student_id"]), 201

@app.put("/students-db/<int:sid>")
@require_role("admin")
def students_db_update(sid):
    data  = request.get_json(force=True)
    valid = {k: v for k, v in data.items() if k in ("student_id", "fullname", "dob", "major")}
    if not valid:
        return jsonify(error="No valid fields"), 400
    set_clause = ", ".join(f"{k}=%s" for k in valid)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(f"UPDATE students SET {set_clause} WHERE id=%s", (*valid.values(), sid))
            if cur.rowcount == 0:
                return jsonify(error="Student not found"), 404
        conn.commit()
    return jsonify(updated=sid)

@app.delete("/students-db/<int:sid>")
@require_role("admin")
def students_db_delete(sid):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM students WHERE id = %s", (sid,))
            if cur.rowcount == 0:
                return jsonify(error="Student not found"), 404
        conn.commit()
    return jsonify(deleted=sid)

# ── Blog API ─────────────────────────────────────────────────────────────────

@app.get("/blogs")
def blogs_list():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, title, content, author_id, image_url,
                       DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at
                FROM blogs ORDER BY created_at DESC
            """)
            return jsonify(cur.fetchall())

@app.get("/blogs/<int:bid>")
def blogs_get(bid):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, title, content, author_id, image_url,
                       DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at,
                       DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%sZ') AS updated_at
                FROM blogs WHERE id = %s
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
                "INSERT INTO blogs (title, content, author_id, image_url) VALUES (%s, %s, %s, %s)",
                (data["title"], data["content"], author_id, data.get("image_url"))
            )
            new_id = cur.lastrowid
        conn.commit()
    return jsonify(id=new_id, title=data["title"], author_id=author_id), 201

@app.put("/blogs/<int:bid>")
@require_auth
def blogs_update(bid):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT author_id FROM blogs WHERE id = %s", (bid,))
            row = cur.fetchone()
    if not row:
        return jsonify(error="Not found"), 404
    payload = g.token_payload
    roles = payload.get("realm_access", {}).get("roles", [])
    username = (payload.get("preferred_username") or "").lower()
    author_id = (row["author_id"] or "").lower()
    if author_id != username and "admin" not in roles:
        return jsonify(error="Forbidden"), 403
    data = request.get_json(force=True)
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
            cur.execute("SELECT author_id FROM blogs WHERE id = %s", (bid,))
            row = cur.fetchone()
    if not row:
        return jsonify(error="Not found"), 404
    payload = g.token_payload
    roles = payload.get("realm_access", {}).get("roles", [])
    username = (payload.get("preferred_username") or "").lower()
    author_id = (row["author_id"] or "").lower()
    if author_id != username and "admin" not in roles:
        return jsonify(error="Forbidden"), 403
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM blogs WHERE id = %s", (bid,))
        conn.commit()
    return jsonify(deleted=bid)

# ── S3 Object Upload ─────────────────────────────────────────────────────────

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
        try:
            s3.head_bucket(Bucket=S3_BUCKET)
        except Exception:
            s3.create_bucket(Bucket=S3_BUCKET)
        key = f"blog/{os.urandom(8).hex()}_{f.filename}"
        s3.upload_fileobj(
            f, S3_BUCKET, key,
            ExtraArgs={"ContentType": f.content_type or "application/octet-stream"}
        )
        client_host = request.headers.get("X-Forwarded-Host") or request.host.split(":")[0]
        url = f"http://{client_host}:9000/{S3_BUCKET}/{key}"
        return jsonify(url=url)
    except Exception as e:
        return jsonify(error=f"Upload failed: {e}"), 503

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8081)
