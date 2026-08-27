#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/inflearn-publisher
ARCHIVE=/tmp/inflearn-publisher.tar.gz

test -f "$ARCHIVE"
install -d -o inflearn-publisher -g inflearn-publisher "$APP_DIR"
tar -xzf "$ARCHIVE" -C "$APP_DIR"
chown -R inflearn-publisher:inflearn-publisher "$APP_DIR"
sudo -u inflearn-publisher npm --prefix "$APP_DIR" ci --omit=dev
systemctl restart inflearn-publisher
systemctl is-active --quiet inflearn-publisher
curl -fsS http://127.0.0.1:8787/health
