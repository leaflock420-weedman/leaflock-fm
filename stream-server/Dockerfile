# Continuous LeafLock radio encoder — separate from the Next.js website.
FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    curl \
    python3 \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && yt-dlp --version \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./

# yt-dlp EJS: Node is the JS runtime (required for current YouTube).
ENV PORT=10000
ENV PATH="/usr/local/bin:${PATH}"
EXPOSE 10000
CMD ["node", "server.js"]
