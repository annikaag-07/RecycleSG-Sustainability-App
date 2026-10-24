
import json
import os
import getpass
import urllib.request
import urllib.error
import subprocess

# Retrieve local Supabase credentials
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

anon_key = env["ANON_KEY"]

email = input("Test user email: ")
password = getpass.getpass("Test user password: ")

url = (
    "http://127.0.0.1:54321/auth/v1/token"
    "?grant_type=password"
)

request = urllib.request.Request(
    url,
    data=json.dumps({
        "email": email,
        "password": password
    }).encode(),
    headers={
        "Content-Type": "application/json",
        "apikey": anon_key
    },
    method="POST"
)

try:
    with urllib.request.urlopen(request) as response:
        data = json.load(response)

    token = data["access_token"]

    # Save privately for the next API test
    token_file = "/tmp/recyclesg_test_token"
    with open(token_file, "w") as f:
        f.write(token)

    os.chmod(token_file, 0o600)

    print("Login successful")
    print("Access token saved securely for local testing")

except urllib.error.HTTPError as error:
    print("Login failed:", error.code)
    print(error.read().decode())
