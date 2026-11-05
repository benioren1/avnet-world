# ארכיטקטורה חיה: one image with the server and the built screens.
#
# Build:  docker build -t avnet-world:1.0 .
# Run:    docker run -p 3001:3001 -e ADMIN_TOKEN=... -e MONGO_URL=... avnet-world:1.0
#
# All configuration comes from environment variables (in Kubernetes: a ConfigMap
# for regular settings and a Secret for codes and the Mongo password). See deploy/k8s/.

# ---------- stage 1: build the screens (React + Vite) ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build

# ---------- stage 2: the runtime image ----------
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3001 \
    GAME_TZ=Asia/Jerusalem
WORKDIR /app

# Only production dependencies (no Vite) in the final image.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# The server, the two shared files it imports from src/, and the built screens.
COPY server ./server
COPY src/model.js src/layout.js ./src/
COPY --from=build /app/dist ./dist

# Local file store location, used only when MONGO_URL is not set (good for a quick try,
# not for Kubernetes: the pod's disk is wiped on restart).
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" || exit 1

CMD ["node", "server/index.js"]
