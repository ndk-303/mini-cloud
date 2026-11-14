#!/bin/sh
set -eu
mc alias set local http://minio:9000 "${MINIO_ROOT_USER:-minioadmin}" "${MINIO_ROOT_PASSWORD:-minioadmin}"
mc mb --ignore-existing local/profile-pics
mc mb --ignore-existing local/documents
mc anonymous set download local/profile-pics
mc anonymous set download local/documents
mc cp /seed/avatar.jpg local/profile-pics/avatar.jpg
mc cp /seed/sample-report.pdf local/documents/sample-report.pdf
mc anonymous set download local/profile-pics
mc anonymous set download local/documents
printf '%s\n' 'MinIO buckets profile-pics and documents are ready.'
