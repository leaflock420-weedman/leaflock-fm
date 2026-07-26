# Continuous LeafLock Locked In Radio encoder (separate from the Next.js website).
# Serves never-ending MP3 at /live.mp3 for native <audio> background playback.
FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./

ENV PORT=8000
EXPOSE 8000
CMD ["node", "server.js"]
