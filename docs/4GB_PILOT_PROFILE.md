# RestoPass 4 GiB Constrained Pilot Profile

**Status: candidate profile; not approved for production until hosted acceptance and load tests pass.**

## Direct answer

The existing default production stack is sized for an 8 GiB VM. Its container memory ceilings total 6.5 GiB before Linux, Docker, filesystem cache, monitoring and peak overhead. Do not deploy that unchanged stack on a 4 GiB VM.

A separate constrained profile is provided for a small, controlled pilot. It lowers the container ceilings to:

| Service | Memory ceiling |
|---|---:|
| PostgreSQL | 768 MiB |
| Redis | 192 MiB |
| Node.js app | 768 MiB |
| Backup worker | 384 MiB |
| Caddy | 128 MiB |
| **Total container ceilings** | **2,240 MiB** |

This leaves approximately 1.7 GiB for the host, Docker, kernel, filesystem cache and transient overhead. It is a budget, not a promise that every workload fits. Docker memory limits can cause a process to be killed when it reaches its ceiling. See the Docker resource-constraint guidance: https://docs.docker.com/engine/containers/resource_constraints

## How to deploy this profile

Only after the host is provisioned and the release candidate has passed CI:

```bash
docker compose \
  --env-file .env \
  -f deploy/docker-compose.prod.yml \
  -f deploy/docker-compose.4gb.yml \
  config --quiet

docker compose \
  --env-file .env \
  -f deploy/docker-compose.prod.yml \
  -f deploy/docker-compose.4gb.yml \
  up -d --build
```

Do not use the override alone; it extends the base production Compose file.

## Constraints and safeguards

- Intended only for one small pilot restaurant / limited scanner concurrency.
- Do not claim a validated DAU, scans-per-second, or multi-restaurant capacity until measured.
- Keep a single app instance. Do not horizontally scale this deployment.
- PostgreSQL is tuned conservatively: 192 MiB shared buffers, 4 MiB work memory, 40 max connections.
- Redis has a 128 MiB max dataset and `noeviction`. This is deliberate: replay-guard keys must not be evicted to make room for new keys. If Redis reaches its limit, new writes fail and protected scan actions must fail closed rather than silently weaken replay protection.
- Node.js old-space heap is capped at 512 MiB; native buffers and other process memory also consume the 768 MiB container ceiling.
- Backup worker is capped at 384 MiB. Large databases or upload archives may exceed this; test a full backup and remote verification with representative data before launch.
- Use SSD/NVMe storage, off-host encrypted backups, monitoring and alerting. Swap is only a short emergency buffer, not replacement RAM.
- Customer scan operations remain cloud-authoritative. This profile does not add offline transaction approval.

## Required acceptance before any live balances

1. Validate the merged Compose config on the actual 4 GiB host.
2. Run the full test, lint, build, dependency audit and Docker image build.
3. Run a hosted soak test with realistic simultaneous scanner requests and top-up/approval bursts.
4. Run a full encrypted backup and off-site download/HMAC verification.
5. Perform an isolated restore drill.
6. Monitor peak and sustained memory, CPU, disk I/O, database connections, Redis memory and OOM events through representative meal-service periods.
7. Keep production closed if any OOM kill, Redis write rejection, readiness failure, backup freshness failure or financial reconciliation discrepancy occurs.

## Recommendation

Choose 8 GiB RAM / 4 vCPU where affordable for the first production deployment. The 4 GiB profile is a cost-controlled pilot option only if the provider cannot offer 8 GiB and the measured workload remains small. If the 4 GiB host fails the acceptance tests, move PostgreSQL and/or Redis to managed services or upgrade the VM; do not remove replay protection, database durability or backups to make the memory fit.
