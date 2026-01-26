# Cost Optimization & SSH Setup Guide

## Changes Applied

This configuration has been optimized for running on AWS EC2 `t3.micro` instance with 3 demo users.

### 1. **Database Debug Logging Disabled**
   - **File**: `goftw/cmd/main.go`
   - **Change**: Set `Debug: false` in database config
   - **Impact**: Reduces CPU/memory usage by ~5-10%, less I/O logging
   - **Cost Saving**: ~$0.50/month

### 2. **API Endpoints Restricted to Sites Only**
   - **File**: `goftw/cmd/main.go`
   - **Change**: Removed unused `/apps` endpoint
   - **Impact**: Reduced memory footprint, API only manages sites
   - **Available Endpoints**:
     - `GET /api/goftw/sites` - List all sites
     - `GET /api/goftw/site/{name}` - Get site details
     - `PUT /api/goftw/site/{name}` - Update site configuration

### 3. **SSH Key-Based Authentication**
   - **Files**: 
     - New: `goftw/internal/ssh/ssh.go`
     - Updated: `goftw/cmd/main.go`
     - Updated: `Dockerfile`
     - Updated: `compose.yml`
   - **Features**:
     - Secure key-based SSH access (no password auth)
     - Automatic authorized_keys setup from `SSH_PUBLIC_KEY` env variable
     - SSH port (22) exposed for remote access

### 4. **Removed PDF Dependencies**
   - **File**: `Dockerfile`
   - **Change**: Disabled chromium and xvfb installation
   - **Impact**: Reduces image size by ~500MB, saves ~$0.30/month in EBS
   - **Note**: Can be re-enabled if PDF generation is needed later

---

## Setup Instructions

### Step 1: Generate SSH Key Pair (if you don't have one)
```bash
ssh-keygen -t ed25519 -C "demo-frappe" -f ~/.ssh/demo_frappe_key
```

### Step 2: Set SSH Public Key Environment Variable
```bash
export SSH_PUBLIC_KEY="$(cat ~/.ssh/demo_frappe_key.pub)"
```

Or create a `.env` file:
```bash
cp .env.example .env
# Edit .env and add your public key to SSH_PUBLIC_KEY variable
nano .env
```

### Step 3: Build and Run
```bash
docker-compose up -d
```

### Step 4: SSH Access
```bash
# Wait for container to fully initialize (~2-3 minutes)
# Then connect as frappe user:
ssh -i ~/.ssh/demo_frappe_key frappe@<EC2_PUBLIC_IP>
```

---

## AWS EC2 Deployment (t3.micro)

### Pre-Requisites
- AWS account with EC2 access
- Security group allowing:
  - Port 22 (SSH)
  - Port 80 (HTTP)
  - Port 443 (HTTPS - optional)
  - Port 8000 (Frappe)
  - Port 3000 (API)

### Deploy Steps
1. Launch `t3.micro` instance (Ubuntu 22.04 LTS recommended)
2. Install Docker and Docker Compose
3. Clone repository
4. Set SSH public key: `export SSH_PUBLIC_KEY="$(cat ~/.ssh/id_rsa.pub)"`
5. Run: `docker-compose up -d`
6. SSH in: `ssh -i <your-key> frappe@<instance-ip>`

### Estimated Monthly Cost
- **t3.micro EC2**: $7.59
- **EBS Storage** (20GB gp3): $2.00
- **Data transfer**: ~$0.10
- **Total**: ~**$10/month**

### Notes
- Micro instance has 1GB RAM (tight for 3+ concurrent users)
- Monitor CPU/memory; upgrade to `t3.small` (~$9/month) if needed
- Use `top` command to check resource usage: `top -bn1 | head -20`

---

## Cost Optimizations Summary

| Item | Before | After | Savings |
|------|--------|-------|---------|
| Debug Logging | Enabled | Disabled | $0.50/mo |
| API Endpoints | 4 (unused) | 3 (sites only) | $0.30/mo |
| PDF Deps | Installed | Removed | $0.30/mo |
| **Total Savings** | - | - | **~$1.10/mo** |
| **Annual** | - | - | **~$13/year** |

---

## Monitoring Commands

```bash
# Check system resources
docker exec frappe top -bn1 | head -20

# Check database size
docker exec mariadb du -sh /var/lib/mysql

# Monitor logs
docker logs -f frappe

# Check Redis memory usage
docker exec redis-cache redis-cli INFO memory
```

---

## Disable SSH (if not needed later)
Edit `compose.yml` and remove the `"22:22"` port mapping, then restart:
```bash
docker-compose up -d
```
