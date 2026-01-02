#!/bin/bash
NGINX_FRAPPE="/etc/nginx/conf.d/frappe.conf"
TEMPLATE_CONF="/patches/nginx-template.conf"
LAST_SITES=""

# Install jq if not present
if ! command -v jq >/dev/null 2>&1; then
    echo "[INFO] jq not found. Installing..."
    if command -v apt-get >/dev/null 2>&1; then
        apt-get update && apt-get install -y jq
    elif command -v yum >/dev/null 2>&1; then
        yum install -y jq
    else
        echo "[ERROR] Could not detect package manager. Please install jq manually."
        exit 1
    fi
fi

while true; do
    # Get raw JSON from microservice
    RAW_JSON=$(curl -s "frappe:3000/api/goftw/sites")
    echo "[DEBUG] Raw response from microservice: $RAW_JSON"

    # Parse JSON into space-separated sites
    SITES=$(echo "$RAW_JSON" | jq -r 'join(" ")')

    # Only update config if sites changed
    if [ -n "$SITES" ] && [ "$SITES" != "$LAST_SITES" ]; then
        echo "[INFO] Updating Nginx config with sites: $SITES"
        sed "s|__SERVER_NAMES__|$SITES|g" "$TEMPLATE_CONF" > "$NGINX_FRAPPE"

        # Test Nginx config before reload
        if nginx -t; then
            # Send SIGHUP to Nginx master process to reload config
            MASTER_PID=$(ps -o pid= -C nginx | head -n1)
            if [ -n "$MASTER_PID" ]; then
                kill -HUP "$MASTER_PID"
                echo "[INFO] Reloaded Nginx via SIGHUP."
            else
                echo "[WARN] Nginx master process not found; cannot reload."
            fi

            LAST_SITES="$SITES"
        else
            echo "[ERROR] Nginx config test failed; skipping reload."
        fi
    else
        echo "[DEBUG] No changes in sites; skipping reload."
    fi

    sleep 30
done
