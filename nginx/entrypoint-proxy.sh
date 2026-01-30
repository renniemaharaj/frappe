#!/bin/bash
set -e

# Read server_name from instance.json
SERVER_NAME=$(jq -r ".server_name" /etc/instance.json)

echo "[nginx-proxy] Configuring with SERVER_NAME=$SERVER_NAME"

# Generate config from template using sed (safer than envsubst)
sed "s/\${SERVER_NAME}/$SERVER_NAME/g" /etc/nginx/conf.d/dynamic-proxy.conf.template > /etc/nginx/conf.d/dynamic-proxy.conf

echo "[nginx-proxy] Dynamic proxy config generated:"
cat /etc/nginx/conf.d/dynamic-proxy.conf

# Start nginx
exec nginx -g "daemon off;"
