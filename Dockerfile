# syntax=docker/dockerfile:1

# ── 開發環境:docker compose --profile dev up dev ──────────────
FROM node:22-alpine AS dev
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 4200
CMD ["npx", "ng", "serve", "--host", "0.0.0.0", "--poll", "1000"]

# ── 建置正式版 ──────────────────────────────────────────────
FROM dev AS build
RUN npx ng build --configuration production

# ── 以 nginx 提供 PWA(service worker 需要 localhost 或 HTTPS)──
FROM nginx:1.27-alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/music-player/browser /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK CMD wget -qO- http://127.0.0.1/ngsw.json >/dev/null || exit 1
