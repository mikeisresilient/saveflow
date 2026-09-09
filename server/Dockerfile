FROM node:22-bookworm-slim

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

#
# Install Deno.
#
RUN curl -fsSL https://deno.land/install.sh | sh

ENV PATH="/root/.deno/bin:${PATH}"

#
# Python virtual environment.
#
RUN python3 -m venv /opt/venv

ENV PATH="/opt/venv/bin:${PATH}"

#
# yt-dlp + EJS + PO Token provider.
#
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir \
        "yt-dlp[default]" \
        "bgutil-ytdlp-pot-provider"

#
# Application.
#
WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY tsconfig.json ./

COPY src ./src

RUN npm run build

ENV NODE_ENV=production

ENV PORT=5000

EXPOSE 5000

CMD ["npm", "start"]