# =============================================================================
# Sovereign Portal C-137 — Multi-Stage Production Image
# Stage 1: turbo-prune the monorepo, install + build the web PWA on Node 22
# Stage 2: serve the static bundle from a hardened nginx:alpine runtime
# Cross-Origin Isolation headers (COOP/COEP) are set in docker/nginx.conf so
# WebGPU / SharedArrayBuffer work without CO-OP breakage.
# =============================================================================

# --- Stage 1a: Pruner -------------------------------------------------------
FROM node:22-alpine AS pruner
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install --global turbo@^2.4.0
COPY . .
RUN turbo prune --scope=@portal/web-pwa --docker

# --- Stage 1b: Builder ------------------------------------------------------
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Install dependencies first (maximally cached layer)
COPY .gitignore .gitignore
COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# Copy the pruned source and build
COPY --from=pruner /app/out/full/ ./
COPY turbo.json turbo.json
ENV NODE_ENV=production
RUN pnpm --filter @portal/database run db:generate || true
RUN pnpm --filter @portal/web-pwa run build

# --- Stage 2: Hardened Nginx Runtime ---------------------------------------
FROM nginx:1.27-alpine AS runner
WORKDIR /usr/share/nginx/html
RUN rm -rf ./*

COPY --from=builder /app/apps/web-pwa/dist ./
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# nginx:alpine drops privileges to `nginx` via the official entrypoint scripts.
RUN touch /var/run/nginx.pid \
  && chown -R nginx:nginx /var/run/nginx.pid /var/cache/nginx /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
