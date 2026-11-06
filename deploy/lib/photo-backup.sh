#!/usr/bin/env bash
# Shared integrity and archive validation helpers for private patron-photo backups.
set -Eeuo pipefail

photo_backup_key() {
  local root_dir="$1" env_file key="${RESTOPASS_BACKUP_ENCRYPTION_KEY:-}"
  env_file="$root_dir/.env"
  if [[ -z "$key" && -f "$env_file" ]]; then
    key="$(sed -n 's/^RESTOPASS_BACKUP_ENCRYPTION_KEY=//p' "$env_file" | head -n 1 | tr -d '"\r')"
  fi
  if ! [[ "$key" =~ ^[A-Fa-f0-9]{64}$ ]]; then
    echo "RESTOPASS_BACKUP_ENCRYPTION_KEY must be a 64-character random hex key (generate with: openssl rand -hex 32)." >&2
    return 1
  fi
  printf '%s' "$key"
}

photo_backup_hmac_key() {
  printf 'RESTOPASS_PHOTO_BACKUP_HMAC:%s' "$1" | sha256sum | awk '{print $1}'
}

write_photo_backup_metadata() {
  local archive="$1" key="$2" hmac_key
  hmac_key="$(photo_backup_hmac_key "$key")"
  sha256sum "$archive" > "$archive.sha256"
  chmod 600 "$archive.sha256"
  openssl dgst -sha256 -hmac "$hmac_key" "$archive" | awk '{print $NF}' > "$archive.hmac"
  chmod 600 "$archive.hmac"
}

verify_photo_backup() {
  local archive="$1" key="$2" expected actual hmac_key
  [[ -s "$archive" && -f "$archive.sha256" && -f "$archive.hmac" ]] || {
    echo "Photo backup, checksum, or authentication tag is missing." >&2
    return 1
  }
  (cd "$(dirname "$archive")" && sha256sum -c "$(basename "$archive").sha256")
  expected="$(tr -d '[:space:]' < "$archive.hmac")"
  hmac_key="$(photo_backup_hmac_key "$key")"
  actual="$(openssl dgst -sha256 -hmac "$hmac_key" "$archive" | awk '{print $NF}')"
  if ! [[ "$expected" =~ ^[A-Fa-f0-9]{64}$ ]] || [[ "$actual" != "$expected" ]]; then
    echo "Photo backup authentication failed: HMAC does not match." >&2
    return 1
  fi
}

validate_photo_archive() {
  local archive="$1" entry
  gzip -t "$archive"
  while IFS= read -r entry; do
    [[ -n "$entry" ]] || continue
    case "$entry" in
      patron-photos|patron-photos/*) ;;
      *) echo "Unexpected path in photo archive: $entry" >&2; return 1 ;;
    esac
    case "/$entry/" in
      */../*|//* ) echo "Unsafe path in photo archive: $entry" >&2; return 1 ;;
    esac
    [[ "$entry" != /* ]] || { echo "Absolute path in photo archive." >&2; return 1; }
  done < <(tar -tzf "$archive")
}
