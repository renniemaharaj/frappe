# Stage 1: Go builder
FROM golang:1.24-alpine AS go-builder

WORKDIR /app
COPY goftw /app/goftw
WORKDIR /app/goftw/cmd
RUN go build -o /goftw-entry


# Stage 2: Runtime
FROM python:3.14.2-trixie

ENV DEBIAN_FRONTEND=noninteractive
ENV FRAPPE_BRANCH=develop

# System deps (stable, cache-friendly)
RUN apt-get update && apt-get install -y \
    git mariadb-server mariadb-client libmariadb-dev redis-server \
    build-essential pkg-config curl wget gnupg sudo cron jq nginx \
    xvfb libfontconfig ca-certificates \
    libssl-dev zlib1g-dev libbz2-dev libreadline-dev \
    libsqlite3-dev libffi-dev liblzma-dev uuid-dev \
    && rm -rf /var/lib/apt/lists/*

# MariaDB utf8mb4
RUN echo "[mysqld]\ncharacter-set-client-handshake = FALSE\ncharacter-set-server = utf8mb4\ncollation-server = utf8mb4_unicode_ci\n\n[mysql]\ndefault-character-set = utf8mb4\n" > /etc/mysql/my.cnf

# Node 24 + yarn + pnpm
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g corepack \
    && corepack enable \
    && corepack prepare pnpm@latest --activate

# Chromium and dependencies for pdf generation
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-dejavu-core \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libdrm2 \
    libgbm1 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

# Python tooling
RUN pip install --upgrade pip setuptools wheel \
    && pip install frappe-bench gunicorn supervisor

# Frappe user
RUN useradd -ms /bin/bash frappe \
    && echo "frappe ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Go binary + configs
COPY --from=go-builder /goftw-entry /usr/local/bin/goftw-entry
COPY instance.json /instance.json
COPY common_site_config.json /common_site_config.json
COPY entrypoint.sh /entrypoint.sh
COPY scripts /scripts
COPY patches /patches

RUN chown -R frappe:frappe \
    /instance.json /common_site_config.json \
    /entrypoint.sh /scripts /patches \
    && chmod +x /entrypoint.sh /scripts/*.sh

USER frappe
WORKDIR /home/frappe
