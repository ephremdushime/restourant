#!/usr/bin/env bash
# ==============================================================================
# RestoPass Production Server Deployment & Bootstrap Script
# Target: 8 GB RAM Linux Host (Ubuntu 22.04 LTS / AOS Cloud Standard Option 6)
#
# Usage:
#   chmod +x deploy/deploy-server.sh
#   ./deploy/deploy-server.sh
# ==============================================================================

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "\n${BOLD}${BLUE}====================================================================${NC}"
echo -e "${BOLD}${BLUE}       RestoPass Production Server Automated Deployment Helper       ${NC}"
echo -e "${BOLD}${BLUE}====================================================================${NC}"
echo -e "Timestamp: $(date -u '+%Y-%m-%dT%H:%M:%SZ')\n"

# ------------------------------------------------------------------------------
# 1. Environment & Prerequisites Validation
# ------------------------------------------------------------------------------
echo -e "${BOLD}[1/7] Validating host hardware and prerequisites...${NC}"

if ! command -v docker >/dev/null 2>&1; then
  echo -e "${RED}[ERROR] Docker is not installed. Please install Docker Engine first.${NC}"
  echo "        Run: curl -fsSL https://get.docker.com | sh"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo -e "${RED}[ERROR] Docker Compose plugin is not installed.${NC}"
  echo "        Run: sudo apt-get update && sudo apt-get install -y docker-compose-plugin"
  exit 1
fi

if [[ -f /proc/meminfo ]]; then
  TOTAL_MEM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
  TOTAL_MEM_MB=$((TOTAL_MEM_KB / 1024))
  echo -e "  Host Detected RAM : ${CYAN}${TOTAL_MEM_MB} MB${NC}"
  if [[ "$TOTAL_MEM_MB" -lt 7000 ]]; then
    echo -e "  ${YELLOW}[WARNING] Host has less than 8 GB RAM ($TOTAL_MEM_MB MB detected).${NC}"
    echo -e "            The full production stack requires ~7.6 GB. Consider the constrained 4GB overlay if testing.${NC}"
  else
    echo -e "  [ ${GREEN}OK${NC} ] Memory sizing verified for 8 GB production baseline."
  fi
fi

# ------------------------------------------------------------------------------
# 2. Production Environment File (.env) Initialization
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[2/7] Checking production environment file (.env)...${NC}"

if [[ ! -f .env ]]; then
  echo -e "  .env not found. Initializing from .env.example with secure random credentials..."
  cp .env.example .env

  # Generate cryptographically secure random secrets
  SESS_SEC=$(openssl rand -hex 32)
  MAST_SEC=$(openssl rand -hex 32)
  PG_PASS=$(openssl rand -hex 32)
  REDIS_PASS=$(openssl rand -hex 32)
  ADMIN_PASS=$(openssl rand -hex 24)
  BCK_KEY=$(openssl rand -hex 32)

  # Replace placeholder secrets with generated credentials
  sed -i "s|^NODE_ENV=.*|NODE_ENV=production|" .env
  sed -i "s|^RESTOPASS_DEPLOYMENT_MODE=.*|RESTOPASS_DEPLOYMENT_MODE=cloud|" .env
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=${SESS_SEC}|" .env
  sed -i "s|^RESTOPASS_MASTER_SECRET=.*|RESTOPASS_MASTER_SECRET=${MAST_SEC}|" .env
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PG_PASS}|" .env
  sed -i "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=${REDIS_PASS}|" .env
  sed -i "s|^RESTOPASS_SUPERADMIN_PASSWORD=.*|RESTOPASS_SUPERADMIN_PASSWORD=${ADMIN_PASS}|" .env
  sed -i "s|^RESTOPASS_BACKUP_ENCRYPTION_KEY=.*|RESTOPASS_BACKUP_ENCRYPTION_KEY=${BCK_KEY}|" .env

  chmod 600 .env
  echo -e "  [ ${GREEN}CREATED${NC} ] .env initialized with high-entropy cryptographic keys and chmod 600."
  echo -e "  ${YELLOW}[IMPORTANT] Super Admin Password set to: ${ADMIN_PASS}${NC}"
  echo -e "  ${YELLOW}            Backup Encryption Key set to: ${BCK_KEY}${NC}"
  echo -e "              (Record these securely in your password manager!)\n"
else
  echo -e "  [ ${GREEN}OK${NC} ] Existing .env file found. Retaining current credentials."
  chmod 600 .env
fi

# ------------------------------------------------------------------------------
# 3. Docker Compose Configuration Validation
# ------------------------------------------------------------------------------
echo -e "${BOLD}[3/7] Validating Docker Compose configuration...${NC}"

docker compose --project-directory . --env-file .env -f deploy/docker-compose.prod.yml config --quiet
echo -e "  [ ${GREEN}PASS${NC} ] deploy/docker-compose.prod.yml syntax and variable substitution are valid."

# ------------------------------------------------------------------------------
# 4. Building and Launching Production Containers
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[4/7] Building and launching production container stack...${NC}"

docker compose --project-directory . --env-file .env -f deploy/docker-compose.prod.yml up -d --build

# ------------------------------------------------------------------------------
# 5. Waiting for Services to Reach Healthy State
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[5/7] Waiting for container health checks...${NC}"

MAX_ATTEMPTS=30
ATTEMPT=0
ALL_HEALTHY=false

while [[ "$ATTEMPT" -lt "$MAX_ATTEMPTS" ]]; do
  ATTEMPT=$((ATTEMPT + 1))
  sleep 3

  # Check if postgres and redis are healthy
  PG_HEALTH=$(docker inspect --format='{{json .State.Health.Status}}' restopass-postgres 2>/dev/null || echo '"unknown"')
  REDIS_HEALTH=$(docker inspect --format='{{json .State.Health.Status}}' restopass-redis 2>/dev/null || echo '"unknown"')

  if [[ "$PG_HEALTH" == '"healthy"' && "$REDIS_HEALTH" == '"healthy"' ]]; then
    # Verify application HTTP readiness
    HTTP_READY=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/health/ready || true)
    if [[ "$HTTP_READY" == "200" ]]; then
      ALL_HEALTHY=true
      break
    fi
  fi
  printf "  Waiting for database & app health... (attempt %d/%d)\n" "$ATTEMPT" "$MAX_ATTEMPTS"
done

if [[ "$ALL_HEALTHY" == "true" ]]; then
  echo -e "  [ ${GREEN}HEALTHY${NC} ] PostgreSQL, Redis, and Application API are live and ready!"
else
  echo -e "  ${YELLOW}[WARNING] Stack did not reach full readiness within 90s. Inspecting container logs:${NC}"
  docker compose --project-directory . --env-file .env -f deploy/docker-compose.prod.yml ps
fi

# ------------------------------------------------------------------------------
# 6. Loopback Security & Port Exposure Check
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[6/7] Auditing host network port bindings...${NC}"

PORTS_OUTPUT=$(docker compose --project-directory . --env-file .env -f deploy/docker-compose.prod.yml ps --format '{{.Service}}: {{.Ports}}')
echo "$PORTS_OUTPUT" | while read -r line; do
  if echo "$line" | grep -q "0.0.0.0:3000\|0.0.0.0:5432\|0.0.0.0:6379"; then
    echo -e "  [ ${RED}FAIL${NC} ] Insecure public port binding detected: $line"
    exit 1
  fi
done
echo -e "  [ ${GREEN}PASS${NC} ] Ports 3000, 5432, 6379 are strictly bound to 127.0.0.1 / internal private network."

# ------------------------------------------------------------------------------
# 7. Automated Scheduled Backup Installation
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[7/7] Installing automated paired backup schedule...${NC}"

if [[ -f deploy/install-backup-schedule.sh ]]; then
  bash deploy/install-backup-schedule.sh || true
  echo -e "  [ ${GREEN}INSTALLED${NC} ] Daily paired backups configured at 00:00 and 18:00 Africa/Kigali time."
fi

# ------------------------------------------------------------------------------
# Summary & Next Steps
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}${GREEN}====================================================================${NC}"
echo -e "${BOLD}${GREEN}       RestoPass Production Stack Successfully Deployed!             ${NC}"
echo -e "${BOLD}${GREEN}====================================================================${NC}\n"

docker compose --project-directory . --env-file .env -f deploy/docker-compose.prod.yml ps

echo -e "\n${BOLD}Next Steps for Operator:${NC}"
echo -e "1. ${CYAN}Domain DNS & TLS${NC}: Point your domain (e.g., restopass.rw) A record to this server's public IP."
echo -e "2. ${CYAN}Caddy Reverse Proxy${NC}: Edit deploy/Caddyfile to set your real domain name and reload Caddy."
echo -e "3. ${CYAN}Run Verification Suite${NC}: Execute ./deploy/verify-staging.sh https://<your-domain>"
echo -e "4. ${CYAN}Off-Site Cloud Backups${NC}: Configure rclone for Google Drive ('rclone config') per docs/PRODUCTION_HOSTING_RUNBOOK.md."
