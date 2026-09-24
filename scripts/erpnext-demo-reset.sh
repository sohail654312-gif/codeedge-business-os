#!/usr/bin/env bash
set -euo pipefail

FRAPPE_DIR="$HOME/.codeedge-demo/frappe_docker"

if [ ! -d "$FRAPPE_DIR" ]; then
  echo "No ERPNext demo environment found."
  exit 0
fi

echo "WARNING: This permanently deletes the disposable ERPNext demo data."
read -r -p "Type RESET to continue: " answer

if [ "$answer" != "RESET" ]; then
  echo "Cancelled."
  exit 0
fi

cd "$FRAPPE_DIR"
docker compose -f pwd.yml down -v

echo "ERPNext demo containers and volumes removed."
