"""Create the demo Keycloak client, roles, and student accounts."""

import os
import sys
import time

import requests


BASE = os.getenv("KEYCLOAK_BASE_URL", "http://localhost:8080").rstrip("/")
ADMIN_USERNAME = os.getenv("KEYCLOAK_ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("KEYCLOAK_ADMIN_PASSWORD", "admin")


def wait_for_keycloak(session, attempts=60):
    url = f"{BASE}/realms/master/.well-known/openid-configuration"
    for attempt in range(attempts):
        try:
            response = session.get(url, timeout=5)
            if response.ok:
                return
        except requests.RequestException:
            pass
        if attempt < attempts - 1:
            time.sleep(2)
    raise RuntimeError(f"Keycloak did not become ready at {BASE}")


def api(session, method, path, **kwargs):
    response = session.request(method, f"{BASE}{path}", timeout=5, **kwargs)
    response.raise_for_status()
    return response.json() if response.content else None


def main():
    with requests.Session() as session:
        print(f"Waiting for Keycloak at {BASE}...")
        wait_for_keycloak(session)
        token = api(
            session,
            "POST",
            "/realms/master/protocol/openid-connect/token",
            data={
                "client_id": "admin-cli",
                "username": ADMIN_USERNAME,
                "password": ADMIN_PASSWORD,
                "grant_type": "password",
            },
        )["access_token"]
        session.headers.update({"Authorization": f"Bearer {token}"})

        clients = api(session, "GET", "/admin/realms/master/clients", params={"clientId": "flask-app"})
        client_settings = {
            "clientId": "flask-app",
            "name": "Flask App",
            "enabled": True,
            "publicClient": True,
            "directAccessGrantsEnabled": True,
            "standardFlowEnabled": True,
            "redirectUris": ["*"],
            "webOrigins": ["*"],
        }
        if clients:
            api(session, "PUT", f"/admin/realms/master/clients/{clients[0]['id']}", json={**clients[0], **client_settings})
        else:
            api(session, "POST", "/admin/realms/master/clients", json=client_settings)

        for role_name in ("admin", "student"):
            response = session.post(
                f"{BASE}/admin/realms/master/roles",
                json={"name": role_name},
                timeout=5,
            )
            if response.status_code != 409:
                response.raise_for_status()
        all_roles = api(session, "GET", "/admin/realms/master/roles")
        roles = {role["name"]: role for role in all_roles}

        admin_users = api(session, "GET", "/admin/realms/master/users", params={"username": ADMIN_USERNAME})
        if not admin_users:
            raise RuntimeError(f"Admin user {ADMIN_USERNAME} was not found")
        api(
            session,
            "POST",
            f"/admin/realms/master/users/{admin_users[0]['id']}/role-mappings/realm",
            json=[roles["admin"]],
        )

        for number in range(1, 6):
            username = f"SV{number:03d}"
            users = api(session, "GET", "/admin/realms/master/users", params={"username": username})
            if not users:
                api(
                    session,
                    "POST",
                    "/admin/realms/master/users",
                    json={
                        "username": username,
                        "enabled": True,
                        "emailVerified": True,
                        "credentials": [{"type": "password", "value": "student123", "temporary": False}],
                    },
                )
                users = api(session, "GET", "/admin/realms/master/users", params={"username": username})
            if not users:
                raise RuntimeError(f"Could not find newly created user {username}")
            api(
                session,
                "POST",
                f"/admin/realms/master/users/{users[0]['id']}/role-mappings/realm",
                json=[roles["student"]],
            )
            print(f"Configured {username}")

    print("Keycloak demo accounts are ready")


if __name__ == "__main__":
    try:
        main()
    except (requests.RequestException, RuntimeError, KeyError) as error:
        print(f"Keycloak setup failed: {error}", file=sys.stderr)
        sys.exit(1)
