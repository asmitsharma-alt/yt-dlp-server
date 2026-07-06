# ---- Build stage ----
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# ---- Production stage ----
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    ffmpeg \
    curl \
    unzip \
    ca-certificates \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/server.js"]
