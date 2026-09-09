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
        git \
    && rm -rf /var/lib/apt/lists/*

#
# Install Deno
#
RUN curl -fsSL https://deno.land/install.sh | sh

ENV PATH="/root/.deno/bin:${PATH}"

#
# Create Python virtual environment
#
RUN python3 -m venv /opt/venv

ENV PATH="/opt/venv/bin:${PATH}"

#
# Install yt-dlp, EJS and BgUtils PO Token provider
#
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir \
        "yt-dlp[default]" \
        "bgutil-ytdlp-pot-provider"

#
# Build the BgUtils PO Token script provider
#
RUN git clone --depth 1 \
        https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git \
        /opt/bgutil-ytdlp-pot-provider \
    && cd /opt/bgutil-ytdlp-pot-provider/server \
    && npm install \
    && npm run build

#
# Application
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