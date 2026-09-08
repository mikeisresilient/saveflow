FROM node:22-bookworm-slim

# Install Python, FFmpeg, Deno and certificates
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        python3-venv \
        ffmpeg \
        ca-certificates \
        curl \
        unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Deno for yt-dlp JavaScript support
RUN curl -fsSL https://deno.land/install.sh | sh

ENV PATH="/root/.deno/bin:${PATH}"

# Create Python virtual environment
RUN python3 -m venv /opt/venv

ENV PATH="/opt/venv/bin:${PATH}"

# Install yt-dlp
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir "yt-dlp[default]"

WORKDIR /app

# Copy package files first for Docker layer caching
COPY package*.json ./

RUN npm ci

# Copy TypeScript configuration and source
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Production environment
ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["npm", "start"]