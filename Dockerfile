# Stage 1: Go Builder
FROM golang:1.24-alpine AS go-builder

WORKDIR /app
COPY /goftw /app/goftw

WORKDIR /app/goftw/cmd/
RUN go build -o /goftw-entry

# Stage 2: Final Runtime
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
# Set root password (change 'yourpassword' to a secure password)
RUN echo "root:yourpassword" | chpasswd

# System dependencies
RUN apt-get update && apt-get install -y \
    git \
    python-is-python3 \
    python3-dev \
    python3-pip \
    python3-venv \
    mariadb-server \
    mariadb-client \
    libmariadb-dev \
    pkg-config \
    redis-server \
    curl \
    wget \
    gnupg \
    build-essential \
    xvfb \
    libfontconfig \
    sudo \
    cron \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Configure MariaDB for utf8mb4
RUN echo "[mysqld]\ncharacter-set-client-handshake = FALSE\ncharacter-set-server = utf8mb4\ncollation-server = utf8mb4_unicode_ci\n\n[mysql]\ndefault-character-set = utf8mb4\n" > /etc/mysql/my.cnf

# Install Node.js 18.x and Yarn globally
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g yarn

# Create frappe user
RUN useradd -ms /bin/bash frappe \
    && echo "frappe ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers \
    && chown -R frappe:frappe /home/frappe

USER frappe
WORKDIR /home/frappe

# Verify Node, npm, Yarn, jq

RUN node -v && npm -v && yarn -v && jq --version
RUN yarn config set network-timeout 600000 -g

USER root
# Install wkhtmltopdf
RUN wget https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6.1-2/wkhtmltox_0.12.6.1-2.jammy_amd64.deb \
    && apt-get update && apt-get install -y ./wkhtmltox_0.12.6.1-2.jammy_amd64.deb \
    && rm wkhtmltox_0.12.6.1-2.jammy_amd64.deb

USER frappe
RUN wkhtmltopdf --version

USER root
# Install Bench CLI + Gunicorn
RUN PIP_BREAK_SYSTEM_PACKAGES=1 pip3 install frappe-bench gunicorn

USER frappe
RUN bench --version
USER root

# Install Supervisor and Nginx
RUN apt-get update && \
    apt-get install -y --no-install-recommends nginx && \
    rm -rf /var/lib/apt/lists/* && \
    PIP_BREAK_SYSTEM_PACKAGES=1 pip3 install supervisor

COPY --from=go-builder /goftw-entry /usr/local/bin/goftw-entry
COPY /instance.json /instance.json
COPY common_site_config.json /common_site_config.json
COPY /entrypoint.sh /entrypoint.sh
COPY /scripts /scripts
COPY /patches /patches

RUN chown frappe:frappe /common_site_config.json /instance.json /patches /scripts /entrypoint.sh \
    && chmod +x /scripts/*.sh /entrypoint.sh

USER frappe
WORKDIR /home/frappe
