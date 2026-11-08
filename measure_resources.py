"""Measure idle and under-load Docker memory for the MiniCloud services.

Run from the project directory with:
    python .\\measure_resources.py

Edit the LOCAL_* settings below to match the local Keycloak/Grafana setup.
The script uses read-only database queries and does not print passwords/tokens.
"""

from __future__ import annotations

import base64
import concurrent.futures
import json
import re
import statistics
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path


# Local Docker Desktop endpoints and sample credentials. Change these if needed.
BASE_URL = "http://127.0.0.1"
KEYCLOAK_URL = "http://127.0.0.1:8080"
GRAFANA_URL = "http://127.0.0.1:3000"
KEYCLOAK_REALM = "master"
KEYCLOAK_CLIENT_ID = "flask-app"
KEYCLOAK_CLIENT_SECRET = ""  # Leave blank for a public client.
KEYCLOAK_USERNAME = "admin"
KEYCLOAK_PASSWORD = "admin"
GRAFANA_USERNAME = "admin"
GRAFANA_PASSWORD = "admin"
GRAFANA_DASHBOARD_UID = "system-health-mssv"
DB_ROOT_PASSWORD = "root"

API_REQUESTS = 100
DB_QUERIES = 30
KEYCLOAK_LOGINS = 20
GRAFANA_READS = 20
API_WORKERS = 8
IDLE_SAMPLES = 5
SAMPLE_INTERVAL_SECONDS = 1
WORKLOAD_MIN_SECONDS = 20

GROUPS = {
    "Web Server 1 & 2": ["web-frontend-server1", "web-frontend-server2"],
    "Application Backend": ["application-backend-server"],
    "Cơ sở dữ liệu": ["relational-database-server"],
    "Xác thực định danh": ["authentication-identity-server"],
    "Lưu trữ đối tượng": ["object-storage-server"],
    "DNS nội bộ": ["internal-dns-server"],
    "Prometheus": ["monitoring-prometheus-server"],
    "Node Exporter": ["monitoring-node-exporter-server"],
    "Grafana Dashboard": ["monitoring-grafana-dashboard-server"],
    "API Gateway": ["api-gateway-proxy-server"],
}

STOP_SAMPLING = threading.Event()
PEAK_MEMORY: dict[str, float] = {}
PEAK_LOCK = threading.Lock()


def http_request(url: str, *, data: bytes | None = None,
                 headers: dict[str, str] | None = None,
                 timeout: float = 10) -> tuple[int | str, bytes]:
    request = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()
    except Exception as error:
        return "ERROR", str(error).encode("utf-8", errors="replace")


def get_token() -> str:
    form = {
        "grant_type": "password",
        "client_id": KEYCLOAK_CLIENT_ID,
        "username": KEYCLOAK_USERNAME,
        "password": KEYCLOAK_PASSWORD,
    }
    if KEYCLOAK_CLIENT_SECRET:
        form["client_secret"] = KEYCLOAK_CLIENT_SECRET
    status, body = http_request(
        f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/token",
        data=urllib.parse.urlencode(form).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        result = json.loads(body)
    except Exception:
        result = {}
    if status != 200 or not result.get("access_token"):
        description = result.get("error_description") or result.get("error") or f"HTTP {status}"
        raise RuntimeError(f"Keycloak không cấp token ({description}). Kiểm tra realm/client/tài khoản.")
    return result["access_token"]


def parse_mib(value: str) -> float:
    match = re.match(r"\s*([0-9.]+)\s*(B|KiB|MiB|GiB)", value)
    if not match:
        raise ValueError(f"Không phân tích được mức RAM Docker: {value!r}")
    amount = float(match.group(1))
    factors = {"B": 1 / 1048576, "KiB": 1 / 1024, "MiB": 1, "GiB": 1024}
    return amount * factors[match.group(2)]


def docker_memory() -> dict[str, float]:
    output = subprocess.check_output(
        ["docker", "stats", "--no-stream", "--format", "{{.Name}}|{{.MemUsage}}"],
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    usage: dict[str, float] = {}
    for line in output.splitlines():
        if "|" not in line:
            continue
        name, values = line.split("|", 1)
        used = values.split("/", 1)[0].strip()
        usage[name] = parse_mib(used)
    return usage


def db_read(_: int = 0) -> int | str:
    completed = subprocess.run(
        [
            "docker", "exec", "-e", f"MYSQL_PWD={DB_ROOT_PASSWORD}",
            "relational-database-server", "mariadb", "-uroot", "-N",
            "-e", "SELECT COUNT(*) FROM studentdb.blogs;",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return completed.returncode


def api_request(_: int = 0) -> int | str:
    status, _ = http_request(f"{BASE_URL}/api/blogs")
    return status


def keycloak_login(_: int = 0) -> int | str:
    form = {
        "grant_type": "password",
        "client_id": KEYCLOAK_CLIENT_ID,
        "username": KEYCLOAK_USERNAME,
        "password": KEYCLOAK_PASSWORD,
    }
    if KEYCLOAK_CLIENT_SECRET:
        form["client_secret"] = KEYCLOAK_CLIENT_SECRET
    status, _ = http_request(
        f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/token",
        data=urllib.parse.urlencode(form).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return status


def grafana_read(_: int = 0) -> int | str:
    raw = f"{GRAFANA_USERNAME}:{GRAFANA_PASSWORD}".encode()
    headers = {"Authorization": "Basic " + base64.b64encode(raw).decode()}
    status, _ = http_request(
        f"{GRAFANA_URL}/api/dashboards/uid/{GRAFANA_DASHBOARD_UID}",
        headers=headers,
    )
    return status


def repeat_for(fn, duration: float) -> Counter:
    deadline = time.monotonic() + duration
    statuses: Counter = Counter()
    while time.monotonic() < deadline:
        statuses[fn()] += 1
    return statuses


def sample_peak() -> None:
    while not STOP_SAMPLING.is_set():
        try:
            snapshot = docker_memory()
            with PEAK_LOCK:
                for name, value in snapshot.items():
                    PEAK_MEMORY[name] = max(PEAK_MEMORY.get(name, 0.0), value)
        except Exception:
            pass
        STOP_SAMPLING.wait(SAMPLE_INTERVAL_SECONDS)


def grouped_value(snapshot: dict[str, float], containers: list[str]) -> float | None:
    values = [snapshot[name] for name in containers if name in snapshot]
    if len(values) != len(containers):
        return None
    return sum(values)


def main() -> None:
    project_dir = Path.cwd()
    if not (project_dir / "docker-compose.yml").exists() and not (project_dir / "compose.yaml").exists():
        raise SystemExit("Hãy chạy script từ thư mục dự án có docker-compose.yml.")

    print(f"Source project: {project_dir}\n")
    print("Đang kiểm tra cấp token Keycloak...")
    get_token()
    print("Keycloak cấp token thành công. Bắt đầu đo mức RAM khi không tải.")

    idle_samples = []
    for _ in range(IDLE_SAMPLES):
        idle_samples.append(docker_memory())
        time.sleep(SAMPLE_INTERVAL_SECONDS)
    idle_names = set.intersection(*(set(sample) for sample in idle_samples))
    idle_average = {
        name: statistics.mean(sample[name] for sample in idle_samples)
        for name in idle_names
    }

    print("Đang tạo tải đồng thời: API, truy vấn DB, Keycloak và Grafana...")
    sampler = threading.Thread(target=sample_peak, daemon=True)
    sampler.start()
    duration = WORKLOAD_MIN_SECONDS
    tasks = {
        "API /api/blogs": (api_request, API_REQUESTS),
        "MariaDB SELECT": (db_read, DB_QUERIES),
        "Keycloak token": (keycloak_login, KEYCLOAK_LOGINS),
        "Grafana dashboard": (grafana_read, GRAFANA_READS),
    }
    results: dict[str, Counter] = {}
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(tasks)) as pool:
            futures = {
                name: pool.submit(repeat_for, fn, duration)
                for name, (fn, _) in tasks.items()
            }
            results = {name: future.result() for name, future in futures.items()}
    finally:
        STOP_SAMPLING.set()
        sampler.join(timeout=3)

    print("\nBảng RAM (MiB): idle là trung bình 5 mẫu; có tải là mức cao nhất ghi nhận.")
    print(f"{'Nhóm dịch vụ':<27} {'Không tải':>12} {'Có tải':>12}")
    for group, containers in GROUPS.items():
        idle = grouped_value(idle_average, containers)
        loaded = grouped_value(PEAK_MEMORY, containers)
        idle_text = f"{idle:.1f}" if idle is not None else "N/A"
        loaded_text = f"{loaded:.1f}" if loaded is not None else "N/A"
        print(f"{group:<27} {idle_text:>12} {loaded_text:>12}")

    print("\nKết quả tải:")
    for name, counts in results.items():
        print(f"{name:<22} {dict(counts)}")
    print("\nGhi chú: thêm hàng Node Exporter vào Bảng 4.8 hoặc gộp vào nhóm Prometheus.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError, FileNotFoundError) as error:
        raise SystemExit(str(error))
