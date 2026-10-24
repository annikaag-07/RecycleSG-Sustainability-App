import json
import getpass
import subprocess
import urllib.request
import urllib.error

result = subprocess.run(
    ["supabase", "status", "-o", "env"],
    capture_output=True,
    text=True,
    check=True
)

env = {}
for line in result.stdout.splitlines():
    key, sep, value = line.partition("=")
    if sep:
        env[key] = value.strip().strip('"')

base = "http://127.0.0.1:54321"

email = input("User B email: ")
password = getpass.getpass("User B password: ")

# Authenticate as User B
login = urllib.request.Request(
    base + "/auth/v1/token?grant_type=password",
    data=json.dumps({
        "email": email,
        "password": password
    }).encode(),
    headers={
        "apikey": env["ANON_KEY"],
        "Content-Type": "application/json"
    },
    method="POST"
)

try:
    with urllib.request.urlopen(login) as response:
        token = json.load(response)["access_token"]

    print("User B login successful")

    # Attempt to use User A's check-in
    request = urllib.request.Request(
        base + "/rest/v1/rpc/submit_recycling_activity",
        data=json.dumps({
            "p_check_in_id": 1,
            "p_material_type_id": 1,
            "p_quantity": 1
        }).encode(),
        headers={
            "apikey": env["ANON_KEY"],
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(request) as response:
            print("TEST FAILED: Another user's check-in was accepted")

    except urllib.error.HTTPError as error:
        body = json.loads(error.read().decode())
        print("HTTP Status:", error.code)
        print("Error:", body.get("message"))

        if (
            error.code == 400
            and body.get("message")
            == "Check-in not found or not owned by user"
        ):
            print("TEST PASSED: Check-in ownership enforced")

except urllib.error.HTTPError as error:
    print("Login failed:", error.code)
    print(error.read().decode())
