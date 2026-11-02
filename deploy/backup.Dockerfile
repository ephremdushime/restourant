FROM postgres:16-alpine
RUN apk add --no-cache openssl
COPY deploy/backup.sh /usr/local/bin/restopass-backup
COPY deploy/backup-verify.sh /usr/local/bin/restopass-backup-verify
COPY deploy/restore.sh /usr/local/bin/restopass-restore
RUN chmod 0755 /usr/local/bin/restopass-backup /usr/local/bin/restopass-backup-verify /usr/local/bin/restopass-restore
ENTRYPOINT ["/usr/local/bin/restopass-backup"]
