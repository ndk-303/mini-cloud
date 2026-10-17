from flask import Flask, jsonify, request
import time, requests, os, json
from jose import jwt
import pymysql
import pymysql.cursors

ISSUER   = os.getenv("OIDC_ISSUER",   "http://authentication-identity-server:8080/realms/master")
AUDIENCE = os.getenv("OIDC_AUDIENCE", "myapp")
JWKS_URL = f"{ISSUER}/protocol/openid-connect/certs"

_JWKS = None
_TS   = 0

def get_jwks():
    global _JWKS, _TS
    now = time.time()
    if not _JWKS or now - _TS > 600:
        _JWKS = requests.get(JWKS_URL, timeout=5).json()
        _TS = now
    return _JWKS

def get_db():
    return pymysql.connect(
        host=os.getenv("DB_HOST", "relational-database-server"),
        user="root",
        password="root",
        database="studentdb",
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
        payload = jwt.decode(
            token, get_jwks(),
            algorithms=["RS256"],
            audience=AUDIENCE,
            issuer=ISSUER
        )
        return jsonify(
            message="Secure resource OK",
            preferred_username=payload.get("preferred_username")
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
