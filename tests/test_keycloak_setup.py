import json
import importlib.util
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


def test_bootstrap_waits_for_slow_first_keycloak_start(monkeypatch):
    script = Path(__file__).resolve().parents[1] / "app" / "setup_keycloak.py"
    spec = importlib.util.spec_from_file_location("setup_keycloak_for_wait_test", script)
    setup_keycloak = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(setup_keycloak)

    class SlowSession:
        calls = 0

        def get(self, _url, timeout):
            self.calls += 1
            return type("Response", (), {"ok": self.calls == 62})()

    session = SlowSession()
    monkeypatch.setattr(setup_keycloak.time, "sleep", lambda _seconds: None)

    setup_keycloak.wait_for_keycloak(session)

    assert session.calls == 62


def test_bootstrap_uses_configured_keycloak_and_can_run_twice():
    clients = set()
    users = {"admin": "id-admin"}
    roles = set()

    class FakeKeycloak(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def reply(self, status, value=None):
            body = json.dumps(value).encode() if value is not None else b""
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            url = urlsplit(self.path)
            if url.path.endswith("/.well-known/openid-configuration"):
                return self.reply(200, {"issuer": "fake"})
            if url.path.endswith("/clients"):
                return self.reply(200, [{"id": "client-1", "clientId": "flask-app"}] if clients else [])
            if url.path.endswith("/roles"):
                return self.reply(200, [{"id": role, "name": role} for role in roles])
            if url.path.endswith("/users"):
                name = parse_qs(url.query).get("username", [""])[0]
                return self.reply(200, [{"id": users[name], "username": name}] if name in users else [])
            return self.reply(404)

        def do_POST(self):
            path = urlsplit(self.path).path
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length)
            if path.endswith("/protocol/openid-connect/token"):
                return self.reply(200, {"access_token": "demo-token"})
            if path.endswith("/clients"):
                clients.add("flask-app")
                return self.reply(201)
            if path.endswith("/roles"):
                role = json.loads(body)["name"]
                existed = role in roles
                roles.add(role)
                return self.reply(409 if existed else 201)
            if path.endswith("/users"):
                name = json.loads(body)["username"]
                users[name] = f"id-{name}"
                return self.reply(201)
            if path.endswith("/role-mappings/realm"):
                return self.reply(204)
            return self.reply(404)

        def do_PUT(self):
            return self.reply(204)

    server = ThreadingHTTPServer(("127.0.0.1", 0), FakeKeycloak)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        env = {**os.environ, "KEYCLOAK_BASE_URL": f"http://127.0.0.1:{server.server_port}"}
        script = Path(__file__).resolve().parents[1] / "app" / "setup_keycloak.py"
        for _ in range(2):
            run = subprocess.run([sys.executable, str(script)], env=env, capture_output=True, text=True, timeout=15)
            assert run.returncode == 0, run.stdout + run.stderr
        assert clients == {"flask-app"}
        assert roles == {"admin", "student"}
        assert set(users) == {"admin", "SV001", "SV002", "SV003", "SV004", "SV005"}
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
