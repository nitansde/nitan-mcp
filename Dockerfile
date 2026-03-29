FROM node:20-slim

# Python + pip for cloudscraper / curl_cffi
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-dev python3-venv gcc curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install Node deps
COPY package.json package-lock.json pnpm-lock.yaml ./
RUN npm install --ignore-scripts

# Copy source and pre-built dist
COPY . .

# Ensure dist is built
RUN npm run build 2>/dev/null || true

# Create .venv and install Python deps (nitan-mcp looks for .venv/bin/python first)
RUN python3 -m venv .venv && \
    .venv/bin/pip install --upgrade pip && \
    .venv/bin/pip install -r requirements.txt

EXPOSE 3001

ENTRYPOINT ["node", "--security-revert=CVE-2023-46809", "dist/index.js"]
CMD ["--transport", "http", "--port", "3001", "--http-allow-reuse"]
