#!/bin/sh
# TC-060: checks the running compose stack's HTTPS proxy. Run after `docker compose up`.
set -eu
HTTPS_PORT="${HTTPS_PORT:-8443}"
HTTP_PORT="${HTTP_PORT:-8080}"
fail() { echo "FAIL: $1"; exit 1; }

curl -sk -o /dev/null -w '%{http_code}' "https://localhost:${HTTPS_PORT}/health" | grep -q 200 || fail "HTTPS health"
curl -sk -D - -o /dev/null "https://localhost:${HTTPS_PORT}/health" | grep -qi '^strict-transport-security: max-age=31536000' || fail "HSTS header"
curl -s -D - -o /dev/null "http://localhost:${HTTP_PORT}/health" | grep -qi "^location: https://localhost:${HTTPS_PORT}/health" || fail "HTTP redirect"
echo | openssl s_client -connect "localhost:${HTTPS_PORT}" -servername localhost -tls1_2 2>/dev/null | grep -q 'TLSv1.2' || fail "TLS 1.2 accepted"
echo | openssl s_client -connect "localhost:${HTTPS_PORT}" -servername localhost -tls1_3 2>/dev/null | grep -q 'TLSv1.3' || fail "TLS 1.3 accepted"
if echo | openssl s_client -connect "localhost:${HTTPS_PORT}" -servername localhost -tls1_1 2>/dev/null | grep -q 'TLSv1.1'; then fail "TLS 1.1 refused"; fi
echo "PASS: HTTPS, HSTS, redirect, TLS 1.2/1.3 only"
