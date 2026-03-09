# ── CodeRunner Backend Dockerfile ──
FROM node:18-alpine

# Install Docker CLI (to spawn execution containers from inside this container)
RUN apk add --no-cache docker-cli

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json ./
RUN npm install

# Copy source
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
