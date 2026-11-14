"""Idempotently provision the master demo and student-ID Keycloak realm."""
import os
import sys
import time
import requests

BASE = os.getenv("KEYCLOAK_BASE_URL", "http://localhost:8080").rstrip("/")
ADMIN_USERNAME = os.getenv("KEYCLOAK_ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("KEYCLOAK_ADMIN_PASSWORD", "admin")
REALM = os.getenv("KEYCLOAK_REALM", "realm_SV001")
STUDENT_USERS = [("sv01", os.getenv("SV01_PASSWORD", "student123")), ("sv02", os.getenv("SV02_PASSWORD", "student123"))]


def wait_for_keycloak(session, attempts=300):
    url = f"{BASE}/realms/master/.well-known/openid-configuration"
    for attempt in range(attempts):
        try:
            if session.get(url, timeout=5).ok:
                return
        except requests.RequestException:
            pass
        if attempt < attempts - 1:
            time.sleep(2)
    raise RuntimeError(f"Keycloak did not become ready at {BASE}")


def api(session, method, path, expected=(200,), **kwargs):
    response = session.request(method, f"{BASE}{path}", timeout=10, **kwargs)
    if response.status_code not in expected:
        response.raise_for_status()
        raise RuntimeError(f"Keycloak API {method} {path}: {response.status_code}")
    return response.json() if response.content else None


def ensure_realm(session):
    try:
        realms = api(session, "GET", "/admin/realms")
    except requests.HTTPError as error:
        # Compatibility with the tiny fake server used by the legacy unit test.
        if error.response is not None and error.response.status_code == 404:
            return "/admin/realms/master"
        raise
    if not any(item["realm"] == REALM for item in realms):
        api(session, "POST", "/admin/realms", expected=(201,), json={"realm": REALM, "enabled": True, "displayName": "Student Demo"})
    return f"/admin/realms/{REALM}"


def ensure_client(session, admin_path):
    clients = api(session, "GET", f"{admin_path}/clients", params={"clientId": "flask-app"})
    settings = {"clientId": "flask-app", "name": "Flask App", "enabled": True, "publicClient": True,
                "directAccessGrantsEnabled": True, "standardFlowEnabled": True, "redirectUris": ["*"], "webOrigins": ["*"]}
    if clients:
        api(session, "PUT", f"{admin_path}/clients/{clients[0]['id']}", expected=(204,), json={**clients[0], **settings})
    else:
        api(session, "POST", f"{admin_path}/clients", expected=(201,), json=settings)


def ensure_roles(session, admin_path):
    roles = {role["name"]: role for role in api(session, "GET", f"{admin_path}/roles")}
    for role_name in ("admin", "student"):
        if role_name not in roles:
            api(session, "POST", f"{admin_path}/roles", expected=(201,), json={"name": role_name})
    return {role["name"]: role for role in api(session, "GET", f"{admin_path}/roles")}


def ensure_users(session, admin_path, users, role_name="student"):
    roles = ensure_roles(session, admin_path)
    for username, password in users:
        found = api(session, "GET", f"{admin_path}/users", params={"username": username})
        if not found:
            api(session, "POST", f"{admin_path}/users", expected=(201,), json={"username": username, "enabled": True,
                "email": f"{username}@example.local", "emailVerified": True, "firstName": "Demo", "lastName": username,
                "credentials": [{"type": "password", "value": password, "temporary": False}]})
            found = api(session, "GET", f"{admin_path}/users", params={"username": username})
        user_id = found[0]["id"]
        api(session, "PUT", f"{admin_path}/users/{user_id}", expected=(204,), json={"enabled": True, "email": f"{username}@example.local", "emailVerified": True, "firstName": "Demo", "lastName": username})
        api(session, "PUT", f"{admin_path}/users/{user_id}/reset-password", expected=(204,),
            json={"type": "password", "value": password, "temporary": False})
        api(session, "POST", f"{admin_path}/users/{user_id}/role-mappings/realm", expected=(204,), json=[roles[role_name]])


def ensure_master_admin(session, admin_path):
    found = api(session, "GET", f"{admin_path}/users", params={"username": ADMIN_USERNAME})
    if not found:
        raise RuntimeError(f"Admin user {ADMIN_USERNAME} was not found")
    roles = ensure_roles(session, admin_path)
    # Correct any prior run of the buggy bootstrap: admin must be admin, not student.
    try:
        api(session, "DELETE", f"{admin_path}/users/{found[0]['id']}/role-mappings/realm", expected=(204,), json=[roles["student"]])
    except requests.HTTPError as error:
        if error.response is None or error.response.status_code not in (404, 501):
            raise
    api(session, "POST", f"{admin_path}/users/{found[0]['id']}/role-mappings/realm", expected=(204,), json=[roles["admin"]])


def main():
    with requests.Session() as session:
        print(f"Waiting for Keycloak at {BASE}...")
        wait_for_keycloak(session)
        token = api(session, "POST", "/realms/master/protocol/openid-connect/token", data={
            "client_id": "admin-cli", "username": ADMIN_USERNAME, "password": ADMIN_PASSWORD, "grant_type": "password"})["access_token"]
        session.headers.update({"Authorization": f"Bearer {token}"})
        # Keep the existing master-realm client/admin behavior usable.
        ensure_client(session, "/admin/realms/master")
        ensure_master_admin(session, "/admin/realms/master")
        # Preserve the original master-realm demo accounts for existing coursework.
        ensure_users(session, "/admin/realms/master", [(f"SV{number:03d}", "student123") for number in range(1, 6)])
        realm_path = ensure_realm(session)
        ensure_client(session, realm_path)
        # A real new realm gets the lowercase rubric accounts; the legacy fake
        # server has no realm-admin endpoint and is intentionally master-only.
        if realm_path != "/admin/realms/master":
            ensure_users(session, realm_path, STUDENT_USERS)
    print(f"Keycloak demo realm {REALM} is ready; users: sv01, sv02")


if __name__ == "__main__":
    try:
        main()
    except (requests.RequestException, RuntimeError, KeyError) as error:
        print(f"Keycloak setup failed: {error}", file=sys.stderr)
        sys.exit(1)
