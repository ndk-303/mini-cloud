import requests, sys

BASE = "http://localhost:8080"

# 1. Login as admin
print("Logging in to Keycloak master realm...")
token_res = requests.post(
    f"{BASE}/realms/master/protocol/openid-connect/token",
    data={
        "client_id": "admin-cli",
        "username": "admin",
        "password": "admin",
        "grant_type": "password"
    }
)
if token_res.status_code != 200:
    print("Failed to login as admin:", token_res.status_code, token_res.text)
    sys.exit(1)

token = token_res.json()["access_token"]
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# 2. Create or verify client 'flask-app'
clients = requests.get(f"{BASE}/admin/realms/master/clients?clientId=flask-app", headers=headers).json()
if not clients:
    print("Creating client flask-app...")
    res = requests.post(
        f"{BASE}/admin/realms/master/clients",
        headers=headers,
        json={
            "clientId": "flask-app",
            "name": "Flask App",
            "enabled": True,
            "publicClient": True,
            "directAccessGrantsEnabled": True,
            "standardFlowEnabled": True,
            "redirectUris": ["*"],
            "webOrigins": ["*"]
        }
    )
    print("Create client:", res.status_code)
else:
    print("Client flask-app exists. Updating directAccessGrantsEnabled...")
    cid = clients[0]["id"]
    requests.put(
        f"{BASE}/admin/realms/master/clients/{cid}",
        headers=headers,
        json={**clients[0], "directAccessGrantsEnabled": True, "publicClient": True, "webOrigins": ["*"]}
    )

# 3. Create Realm Roles: admin and student
for role_name in ["admin", "student"]:
    r = requests.post(f"{BASE}/admin/realms/master/roles", headers=headers, json={"name": role_name})
    if r.status_code in [201, 409]:
        print(f"Role {role_name} ready.")
    else:
        print(f"Error creating role {role_name}:", r.status_code, r.text)

roles = requests.get(f"{BASE}/admin/realms/master/roles", headers=headers).json()
admin_role = [r for r in roles if r["name"] == "admin"][0]
student_role = [r for r in roles if r["name"] == "student"][0]

# 4. Assign role 'admin' to user 'admin'
users = requests.get(f"{BASE}/admin/realms/master/users?username=admin", headers=headers).json()
if users:
    admin_uid = users[0]["id"]
    requests.post(
        f"{BASE}/admin/realms/master/users/{admin_uid}/role-mappings/realm",
        headers=headers,
        json=[admin_role]
    )
    print("Assigned role 'admin' to user 'admin'.")

# 5. Create users SV001 - SV005
for i in range(1, 6):
    username = f"SV00{i}"
    u_list = requests.get(f"{BASE}/admin/realms/master/users?username={username}", headers=headers).json()
    if not u_list:
        print(f"Creating user {username}...")
        res = requests.post(
            f"{BASE}/admin/realms/master/users",
            headers=headers,
            json={
                "username": username,
                "enabled": True,
                "emailVerified": True,
                "credentials": [{"type": "password", "value": "student123", "temporary": False}]
            }
        )
        if res.status_code == 201:
            u_list = requests.get(f"{BASE}/admin/realms/master/users?username={username}", headers=headers).json()
    
    if u_list:
        uid = u_list[0]["id"]
        # Update credentials just in case
        requests.put(
            f"{BASE}/admin/realms/master/users/{uid}/reset-password",
            headers=headers,
            json={"type": "password", "value": "student123", "temporary": False}
        )
        # Assign role student
        requests.post(
            f"{BASE}/admin/realms/master/users/{uid}/role-mappings/realm",
            headers=headers,
            json=[student_role]
        )
        print(f"User {username} configured with role 'student'.")

print("Keycloak configuration complete!")
