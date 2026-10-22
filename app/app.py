from flask import Flask, jsonify, request
import time, requests, os, json
from jose import jwt
import pymysql
import pymysql.cursors

ISSUER   = os.getenv("OIDC_ISSUER",   "http://authentication-identity-server:8080/realms/master")
AUDIENCE = os.getenv("OIDC_AUDIENCE", "myapp")

_JWKS_CACHE = {}

def get_jwks(issuer_url):
    now = time.time()
    cached = _JWKS_CACHE.get(issuer_url)
    if not cached or now - cached["ts"] > 600:
        jwks_url = f"{issuer_url.rstrip('/')}/protocol/openid-connect/certs"
        # Hỗ trợ phân giải nếu issuer trong token dùng localhost:8081
        internal_url = jwks_url.replace("localhost:8081", "authentication-identity-server:8080") \
                               .replace("127.0.0.1:8081", "authentication-identity-server:8080")
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

app = Flask(__name__)

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
        # Lấy dynamic issuer từ token để hỗ trợ cả master realm và realm_<MSSV>
        unverified_claims = jwt.get_unverified_claims(token)
        token_issuer = unverified_claims.get("iss", ISSUER)
        jwks = get_jwks(token_issuer)

        # Giải mã và xác thực chữ ký RS256, linh hoạt audience (hỗ trợ flask-app, myapp...)
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

# ── Extension 2: JSON file API ───────────────────────────────────────────────

@app.get("/student")
def student():
    with open("students.json", encoding="utf-8") as f:
        return jsonify(json.load(f))

# ── Extension 3: MariaDB CRUD ────────────────────────────────────────────────

@app.get("/students-db")
def students_db_list():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM students")
            return jsonify(cur.fetchall())

@app.get("/students-db/<int:sid>")
def students_db_get(sid):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM students WHERE id = %s", (sid,))
            row = cur.fetchone()
    return jsonify(row) if row else (jsonify(error="Not found"), 404)

@app.put("/students-db/<int:sid>")
def students_db_update(sid):
    data  = request.get_json(force=True)
    valid = {k: v for k, v in data.items() if k in ("student_id", "fullname", "dob", "major")}
    if not valid:
        return jsonify(error="No valid fields"), 400
    set_clause = ", ".join(f"{k}=%s" for k in valid)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(f"UPDATE students SET {set_clause} WHERE id=%s", (*valid.values(), sid))
        conn.commit()
    return jsonify(updated=sid)

@app.delete("/students-db/<int:sid>")
def students_db_delete(sid):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM students WHERE id = %s", (sid,))
        conn.commit()
    return jsonify(deleted=sid)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8081)
