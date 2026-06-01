#!/bin/bash
set -e

# Pull, rebuild the frontend, refresh deps, restart the service.
# Run on the Lightsail box from the repo root.

APP_DIR=/opt/apps/reno-tracker
cd "$APP_DIR"

echo "==> Pulling latest..."
git pull origin main

echo "==> Building frontend..."
cd "$APP_DIR/frontend"
npm install
npm run build

echo "==> Updating backend deps..."
cd "$APP_DIR/backend"
./venv/bin/pip install -q -r requirements.txt

echo "==> Ensuring data dir exists..."
mkdir -p "$APP_DIR/data"

echo "==> Restarting service..."
sudo systemctl restart expenses.service

echo "==> Done. Live at https://expenses.deepakbaby.in"
