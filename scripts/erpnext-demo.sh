#!/usr/bin/env bash
set -euo pipefail

ROOT="$HOME/.codeedge-demo"
FRAPPE_DIR="$ROOT/frappe_docker"

mkdir -p "$ROOT"

if [ ! -d "$FRAPPE_DIR/.git" ]; then
  echo "Cloning official Frappe Docker repository..."
  git clone --depth 1 https://github.com/frappe/frappe_docker "$FRAPPE_DIR"
else
  echo "Updating Frappe Docker repository..."
  git -C "$FRAPPE_DIR" pull --ff-only || true
fi

cd "$FRAPPE_DIR"

echo "Starting disposable ERPNext demo..."
docker compose -f pwd.yml up -d

echo
echo "ERPNext containers are starting."
echo "Administrator username: Administrator"
echo "Administrator password: admin"
echo
echo "Waiting for http://localhost:8080 to respond..."

for i in $(seq 1 120); do
  if curl --connect-timeout 2 --max-time 5 -fsS http://localhost:8080 >/dev/null 2>&1; then
    echo
    echo "ERPNext is responding on port 8080."
    echo "Open the forwarded port named 'ERPNext Demo' in Codespaces."
    exit 0
  fi
  sleep 5
done

echo
echo "ERPNext did not become ready within the expected window."
echo "Showing diagnostics:"
docker compose -f pwd.yml ps || true
echo
echo "create-site logs:"
docker compose -f pwd.yml logs create-site --tail=80 || true
echo
echo "backend logs:"
docker compose -f pwd.yml logs backend --tail=80 || true
exit 1
