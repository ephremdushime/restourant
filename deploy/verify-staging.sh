#!/usr/bin/env bash
# ==============================================================================
# RestoPass Staging & Production Smoke Test Verification Script
# Validates DNS, TLS, Health, Component Readiness, Security Headers & Auth Gates
#
# Usage:
#   ./deploy/verify-staging.sh https://staging.restopass.rw
#   or:
#   RESTOPASS_STAGING_URL=https://staging.restopass.rw ./deploy/verify-staging.sh
# ==============================================================================

set -euo pipefail

TARGET_URL="${1:-${RESTOPASS_STAGING_URL:-}}"

if [[ -z "$TARGET_URL" ]]; then
  echo "Usage: $0 <TARGET_URL>"
  echo "Example: $0 https://staging.restopass.rw"
  exit 1
fi

# Remove trailing slash if present
TARGET_URL="${TARGET_URL%/}"

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

report_result() {
  local check_name="$1"
  local status="$2" # PASS, FAIL, WARN
  local details="$3"

  TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  if [[ "$status" == "PASS" ]]; then
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
    printf "  [ ${GREEN}PASS${NC} ] %-42s %s\n" "$check_name" "$details"
  elif [[ "$status" == "WARN" ]]; then
    printf "  [ ${YELLOW}WARN${NC} ] %-42s %s\n" "$check_name" "$details"
  else
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
    printf "  [ ${RED}FAIL${NC} ] %-42s %s\n" "$check_name" "$details"
  fi
}

echo -e "\n${BOLD}${BLUE}====================================================================${NC}"
echo -e "${BOLD}${BLUE}       RestoPass Cloud Staging Verification & Smoke Test Suite       ${NC}"
echo -e "${BOLD}${BLUE}====================================================================${NC}"
echo -e "Target URL: ${BOLD}${TARGET_URL}${NC}"
echo -e "Timestamp : $(date -u '+%Y-%m-%dT%H:%M:%SZ')\n"

# ------------------------------------------------------------------------------
# 1. Connectivity & HTTP Status of Base URL
# ------------------------------------------------------------------------------
BASE_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$TARGET_URL" || echo "000")
if [[ "$BASE_HTTP_CODE" == "200" || "$BASE_HTTP_CODE" == "301" || "$BASE_HTTP_CODE" == "302" ]]; then
  report_result "Base URL Connectivity" "PASS" "HTTP status $BASE_HTTP_CODE"
else
  report_result "Base URL Connectivity" "FAIL" "HTTP status $BASE_HTTP_CODE (expected 200/301/302)"
fi

# ------------------------------------------------------------------------------
# 2. TLS / HTTPS Certificate Inspection (if target is HTTPS)
# ------------------------------------------------------------------------------
if [[ "$TARGET_URL" =~ ^https:// ]]; then
  HOSTNAME=$(echo "$TARGET_URL" | awk -F[/:] '{print $4}')
  TLS_VALID=$(curl -sIv --connect-timeout 5 "$TARGET_URL" 2>&1 | grep -i "SSL certificate verify ok" || true)
  if [[ -n "$TLS_VALID" ]] || curl -s -f -o /dev/null "$TARGET_URL"; then
    report_result "TLS Certificate Validity" "PASS" "Valid certificate for $HOSTNAME"
  else
    report_result "TLS Certificate Validity" "FAIL" "Certificate verification failed"
  fi
else
  report_result "TLS Enforcement Check" "WARN" "Target is plain HTTP ($TARGET_URL)"
fi

# ------------------------------------------------------------------------------
# 3. Liveness Probe: GET /api/health
# ------------------------------------------------------------------------------
HEALTH_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" --connect-timeout 5 "$TARGET_URL/api/health" || echo "HTTP_STATUS:000")
HEALTH_STATUS=$(echo "$HEALTH_RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | grep -v "HTTP_STATUS:")

if [[ "$HEALTH_STATUS" == "200" ]] && echo "$HEALTH_BODY" | grep -q '"status":"ok"'; then
  report_result "Liveness Probe (/api/health)" "PASS" "Status: ok (HTTP 200)"
else
  report_result "Liveness Probe (/api/health)" "FAIL" "Status: $HEALTH_STATUS, Body: $HEALTH_BODY"
fi

# ------------------------------------------------------------------------------
# 4. Readiness Probe: GET /api/health/ready (Database + Redis)
# ------------------------------------------------------------------------------
READY_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" --connect-timeout 5 "$TARGET_URL/api/health/ready" || echo "HTTP_STATUS:000")
READY_STATUS=$(echo "$READY_RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
READY_BODY=$(echo "$READY_RESPONSE" | grep -v "HTTP_STATUS:")

if [[ "$READY_STATUS" == "200" ]] && echo "$READY_BODY" | grep -q '"database":"ok"' && echo "$READY_BODY" | grep -q '"redis":"ok"'; then
  report_result "Readiness Probe (/api/health/ready)" "PASS" "Database: ok | Redis: ok (HTTP 200)"
else
  report_result "Readiness Probe (/api/health/ready)" "FAIL" "Status: $READY_STATUS, Body: $READY_BODY"
fi

# ------------------------------------------------------------------------------
# 5. Security Headers Verification
# ------------------------------------------------------------------------------
HEADERS=$(curl -s -I --connect-timeout 5 "$TARGET_URL/" || true)

# X-Content-Type-Options: nosniff
if echo "$HEADERS" | grep -iq "x-content-type-options:.*nosniff"; then
  report_result "Header: X-Content-Type-Options" "PASS" "nosniff present"
else
  report_result "Header: X-Content-Type-Options" "FAIL" "Missing nosniff header"
fi

# X-Frame-Options: DENY
if echo "$HEADERS" | grep -iq "x-frame-options:.*deny"; then
  report_result "Header: X-Frame-Options" "PASS" "DENY present"
else
  report_result "Header: X-Frame-Options" "FAIL" "Missing X-Frame-Options DENY header"
fi

# Strict-Transport-Security (HSTS, required for HTTPS)
if [[ "$TARGET_URL" =~ ^https:// ]]; then
  if echo "$HEADERS" | grep -iq "strict-transport-security:"; then
    report_result "Header: Strict-Transport-Security" "PASS" "HSTS enforced"
  else
    report_result "Header: Strict-Transport-Security" "FAIL" "HSTS missing on HTTPS host"
  fi
fi

# Permissions-Policy
if echo "$HEADERS" | grep -iq "permissions-policy:"; then
  report_result "Header: Permissions-Policy" "PASS" "Restricted browser features"
else
  report_result "Header: Permissions-Policy" "WARN" "Permissions-Policy header omitted"
fi

# Server Token Masking (Should not expose server software version)
SERVER_HEADER=$(echo "$HEADERS" | grep -i "^server:" || true)
if [[ -z "$SERVER_HEADER" ]] || echo "$SERVER_HEADER" | grep -ivq "caddy/\|express/\|nginx/\|apache/"; then
  report_result "Header: Server Masking" "PASS" "Server banner suppressed or generic"
else
  report_result "Header: Server Masking" "WARN" "Server header reveals version: $SERVER_HEADER"
fi

# ------------------------------------------------------------------------------
# 6. Protected Endpoint Authentication Enforcement
# ------------------------------------------------------------------------------
STATE_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$TARGET_URL/api/state" || echo "000")
if [[ "$STATE_CODE" == "401" ]]; then
  report_result "Auth Gate: GET /api/state" "PASS" "HTTP 401 Unauthorized"
else
  report_result "Auth Gate: GET /api/state" "FAIL" "HTTP status $STATE_CODE (expected 401)"
fi

# ------------------------------------------------------------------------------
# 7. Path Traversal & Photo Authorization Guard
# ------------------------------------------------------------------------------
TRAVERSAL_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$TARGET_URL/api/customer/photo?key=../../../../etc/passwd" || echo "000")
if [[ "$TRAVERSAL_CODE" == "400" || "$TRAVERSAL_CODE" == "401" ]]; then
  report_result "Path Traversal Guard on Photos" "PASS" "HTTP $TRAVERSAL_CODE (Blocked before file access)"
else
  report_result "Path Traversal Guard on Photos" "FAIL" "HTTP status $TRAVERSAL_CODE (expected 400 or 401)"
fi

UNAUTH_PHOTO_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$TARGET_URL/api/customer/photo?key=unauthorized-photo.jpg" || echo "000")
if [[ "$UNAUTH_PHOTO_CODE" == "401" || "$UNAUTH_PHOTO_CODE" == "403" ]]; then
  report_result "Photo Access Authorization Gate" "PASS" "HTTP $UNAUTH_PHOTO_CODE Forbidden/Unauthorized"
else
  report_result "Photo Access Authorization Gate" "FAIL" "HTTP status $UNAUTH_PHOTO_CODE (expected 401 or 403)"
fi

# ------------------------------------------------------------------------------
# 8. Public Restaurants Directory Endpoint
# ------------------------------------------------------------------------------
PUBLIC_RESTO_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$TARGET_URL/api/public/restaurants" || echo "000")
if [[ "$PUBLIC_RESTO_CODE" == "200" ]]; then
  report_result "Public Endpoint: /api/public/restaurants" "PASS" "HTTP 200 OK"
else
  report_result "Public Endpoint: /api/public/restaurants" "FAIL" "HTTP status $PUBLIC_RESTO_CODE (expected 200)"
fi

# ------------------------------------------------------------------------------
# Final Verification Summary
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}${BLUE}====================================================================${NC}"
echo -e "Summary: ${BOLD}${TOTAL_CHECKS}${NC} total checks | ${GREEN}${PASSED_CHECKS} passed${NC} | ${RED}${FAILED_CHECKS} failed${NC}"
echo -e "${BOLD}${BLUE}====================================================================${NC}\n"

if [[ "$FAILED_CHECKS" -gt 0 ]]; then
  echo -e "${BOLD}${RED}>>> STAGING VERIFICATION FAILED: Fix the above failures before proceeding to Phase 5. <<<${NC}\n"
  exit 1
else
  echo -e "${BOLD}${GREEN}>>> STAGING VERIFICATION PASSED: Host is ready for Phase 5 Restaurant Acceptance Testing. <<<${NC}\n"
  exit 0
fi
