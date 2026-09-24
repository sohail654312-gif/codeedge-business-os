#!/usr/bin/env bash
set -euo pipefail

FRAPPE_DIR="$HOME/.codeedge-demo/frappe_docker"

if [ ! -d "$FRAPPE_DIR" ]; then
  echo "No ERPNext demo environment found."
  exit 0
fi

cd "$FRAPPE_DIR"
docker compose -f pwd.yml down

echo "ERPNext demo stopped. Demo volumes are preserved."
