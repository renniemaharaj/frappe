# Dynamic Nginx Proxy Configuration Guide

## Overview

This setup enables dynamic path-based routing for multiple sites under a single Frappe deployment while preserving all Frappe framework functionality. The configuration allows serving custom site content via `/{site_name}/` paths while maintaining compatibility with the existing Frappe nginx configuration.

## Architecture

```
Client Request
    ↓
Port 2020 (Dynamic Proxy Server)
    ↓
    ├─ Frappe Framework Paths → Port 80 (Frappe Nginx)
    │  ├─ /frappe/*
    │  ├─ /assets/*
    │  ├─ /socket.io
    │  ├─ /api/*
    │  ├─ /login, /logout
    │  └─ /desk, /app, /data, /method
    │
    ├─ Site Static Files → /var/www/{site_name}/*
    │  (if directory exists)
    │
    └─ All Other Requests → Port 80 (Frappe Nginx)
```

## Configuration Files

### 1. **nginx/conf.d/dynamic-proxy.conf** (NEW)

Production-ready nginx configuration that:

- **Listens on port 2020** for incoming requests
- **Server name**: hrtmpaydev.thewriterco.com (update as needed)
- **Preserves Frappe paths** with high-priority regex matching
- **Dynamic site routing** with strict path validation
- **Fallback handling** for non-existent sites
- **Proper logging** to `/var/log/nginx/dynamic_proxy.access.log` and `.error.log`
- **Security headers** (X-Frame-Options, X-Content-Type-Options, etc.)
- **Gzip compression** for bandwidth optimization
- **WebSocket support** for socket.io proxying

### 2. **compose.yml** (UPDATED)

Added port 2020 mapping:
```yaml
ports:
  - "80:80"      # Nginx (main Frappe)
  - "2020:2020"  # Dynamic proxy for multi-site routing
  - "8000:8000"  # Frappe web
  - "9000:9000"  # Socket.IO port
  - "3000:3000"  # API
```

## Request Flow

### Example 1: Frappe Framework Request
```
Request: GET http://hrtmpaydev.thewriterco.com:2020/api/resource/DocType
    ↓
Dynamic Proxy detects /api/* pattern
    ↓
Proxy to http://frappe:80
    ↓
Frappe Nginx handles the request
```

### Example 2: Custom Site Static File
```
Request: GET http://hrtmpaydev.thewriterco.com:2020/mysite/index.html
    ↓
Dynamic Proxy checks if /var/www/mysite exists
    ↓
If yes → serve from filesystem
If no → proxy to http://frappe:80
```

### Example 3: Custom Site with Fallback
```
Request: GET http://hrtmpaydev.thewriterco.com:2020/mysite/api/data
    ↓
Dynamic Proxy checks if /var/www/mysite/api/data exists
    ↓
If no → proxy to http://frappe:80 (Frappe handles it)
```

## Configuration Details

### Frappe Framework Paths (Priority 1)

These paths are matched with highest priority and always proxied to Frappe:

```regex
^/(frappe|assets|socket\.io|api|login|logout|app|desk|data|method|api/resource|api/method)(/|$)
```

**Includes:**
- `/frappe/*` - Frappe core functionality
- `/assets/*` - Static assets
- `/socket.io` - WebSocket connections
- `/api/*` - API endpoints
- `/login`, `/logout` - Authentication
- `/app`, `/desk` - Web UI
- `/data`, `/method` - Data endpoints

### Dynamic Site Routing (Priority 2)

Matches pattern: `^/(?<site>[a-zA-Z0-9_\-]+)(?<path>/.*)?$`

**Behavior:**
1. Extracts site name from URL path
2. Checks if `/var/www/{site}` directory exists
3. If exists: attempts to serve static files with `try_files`
4. If not found: falls back to Frappe proxy
5. If directory doesn't exist: proxies to Frappe

### Proxy Headers

All proxy requests include:
- `Host` - Original host header
- `X-Forwarded-For` - Client IP chain
- `X-Forwarded-Proto` - Original protocol (http/https)
- `X-Real-IP` - Client real IP

### Timeouts

All proxy connections use:
- `proxy_read_timeout 120s` - Wait for backend response
- `proxy_connect_timeout 30s` - Connection establishment
- `proxy_send_timeout 60s` - Send request to backend

## Usage Examples

### Create a Custom Site

```bash
# Create site directory
mkdir -p /var/www/mysite

# Add HTML content
echo "<h1>Hello from MyVoice Site</h1>" > /var/www/mysite/index.html

# Access via
# http://hrtmpaydev.thewriterco.com:2020/mysite/
```

### Supported Site Names

Site names must match: `[a-zA-Z0-9_\-]+`

**Valid:**
- `/site1/`
- `/my-site/`
- `/site_name/`
- `/MyVoice/`

**Invalid:**
- `/site name/` (spaces)
- `/site@name/` (special chars)
- `/123/` (must start with letter)

## Deployment Steps

1. **Copy config to container:**
   - `nginx/conf.d/dynamic-proxy.conf` is automatically included
   - No additional config copy needed

2. **Create site directories:**
   ```bash
   docker exec frappe mkdir -p /var/www/site1
   docker exec frappe mkdir -p /var/www/site2
   ```

3. **Add content:**
   ```bash
   docker exec frappe sh -c 'echo "<h1>Site 1</h1>" > /var/www/site1/index.html'
   ```

4. **Verify via compose:**
   ```bash
   # Update compose.yml with port 2020
   docker compose up -d
   
   # Test
   curl -H "Host: hrtmpaydev.thewriterco.com" http://localhost:2020/site1/
   curl -H "Host: hrtmpaydev.thewriterco.com" http://localhost:2020/api/resource/DocType
   ```

## Logging

### Access Logs
**File:** `/var/log/nginx/dynamic_proxy.access.log`

Shows all requests to the dynamic proxy with:
- Client IP
- Request time
- HTTP method/path
- Status code
- Response size
- User agent

### Error Logs
**File:** `/var/log/nginx/dynamic_proxy.error.log`

Shows any proxy errors or misconfiguration issues

**View logs:**
```bash
docker exec frappe tail -f /var/log/nginx/dynamic_proxy.access.log
docker exec frappe tail -f /var/log/nginx/dynamic_proxy.error.log
```

## Monitoring

### Health Check
```bash
curl http://localhost:2020/health
# Response: healthy
```

### Verify Proxy Working
```bash
# Test Frappe endpoint
curl -H "Host: hrtmpaydev.thewriterco.com" http://localhost:2020/api/resource/DocType

# Test site routing
curl -H "Host: hrtmpaydev.thewriterco.com" http://localhost:2020/mysite/
```

## Troubleshooting

### Issue: Site returns 404
**Check:**
1. Directory exists: `docker exec frappe ls -la /var/www/sitename/`
2. File exists: `docker exec frappe ls -la /var/www/sitename/index.html`
3. Permissions: `docker exec frappe stat /var/www/sitename/`

### Issue: Frappe requests blocked
**Check:**
1. Verify regex in dynamic-proxy.conf matches your paths
2. Check nginx syntax: `docker exec frappe nginx -t`
3. Reload nginx: `docker exec frappe nginx -s reload`

### Issue: WebSocket errors
**Check:**
1. Verify `/socket.io` is in Frappe paths list
2. Check socket.io upstream in frappe.conf
3. Verify proxy headers include `Upgrade` and `Connection`

### Reload Configuration
```bash
docker exec frappe nginx -s reload
```

### View Nginx Config
```bash
docker exec frappe nginx -T  # All configs merged
```

## Security Considerations

1. **Path Validation:** Site names are validated with regex `[a-zA-Z0-9_\-]+`
2. **Directory Traversal:** Using `if (-d /var/www/$site)` prevents ../.. attacks
3. **Security Headers:** All responses include standard security headers
4. **X-Frame-Options:** Set to SAMEORIGIN to prevent clickjacking
5. **X-Content-Type-Options:** Set to nosniff to prevent MIME sniffing

## Performance Optimization

1. **Gzip Compression:** Enabled for text/json/js/css
2. **Keep-Alive:** Enabled for connection reuse
3. **Async:** All proxy requests are async (non-blocking)
4. **Caching:** Configure based on your site needs

## Production Checklist

- [ ] Update `server_name` to your actual domain
- [ ] Create required `/var/www/{site}` directories
- [ ] Add site content files
- [ ] Test Frappe endpoints still work
- [ ] Test site routing works
- [ ] Configure DNS for domain
- [ ] Set up SSL/TLS (if needed)
- [ ] Monitor logs for errors
- [ ] Set up log rotation
- [ ] Configure backup strategy

## Advanced: Custom Location Blocks

To add custom location blocks, extend the config by adding before the fallback `location /`:

```nginx
# Example: Custom API endpoint
location ~ ^/custom-api/(.*)$ {
    proxy_pass http://custom_backend:8080/$1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

## References

- Nginx Documentation: https://nginx.org/en/docs/
- Frappe Nginx Config: https://frappeframework.com/docs/user/en/deployment
- WebSocket Proxying: https://nginx.org/en/docs/http/websocket.html
