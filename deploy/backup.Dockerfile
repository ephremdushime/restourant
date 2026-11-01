FROM postgres:16-alpine
RUN apk add --no-cache openssl
COPY deploy/backup.sh /usr/local/bin/restopass-backup
RUN chmod 0755 /usr/local/bin/restopass-backup
ENTRYPOINT ["/usr/local/bin/restopass-backup"]
