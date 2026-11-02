FROM postgres:16-alpine
RUN apk add --no-cache openssl aws-cli
COPY deploy/backup.sh /usr/local/bin/restopass-backup
COPY deploy/backup-verify.sh /usr/local/bin/restopass-backup-verify
COPY deploy/restore.sh /usr/local/bin/restopass-restore
COPY deploy/restore-offsite.sh /usr/local/bin/restopass-restore-offsite
COPY deploy/backup-healthcheck.sh /usr/local/bin/restopass-backup-healthcheck
RUN chmod 0755 /usr/local/bin/restopass-backup /usr/local/bin/restopass-backup-verify /usr/local/bin/restopass-restore /usr/local/bin/restopass-restore-offsite /usr/local/bin/restopass-backup-healthcheck
ENTRYPOINT ["/usr/local/bin/restopass-backup"]
