# syntax=docker/dockerfile:1

# ---------- 1. Budowanie frontendu ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY shared shared
COPY client client
RUN npm run build -w client

# ---------- 2. Obraz produkcyjny (tylko serwer + zbudowany frontend) ----------
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0 \
    DATA_DIR=/data
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev -w @studnia/server && npm cache clean --force

COPY shared shared
COPY server/src server/src
COPY --from=build /app/client/dist client/dist

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/src/index.js"]
