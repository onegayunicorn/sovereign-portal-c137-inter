# ============================================================================
# Sovereign Portal C-137 — ultra-lightweight static portal container
# Zero build step: the portal is a self-contained static bundle.
# ============================================================================
FROM nginx:1.27-alpine-slim

LABEL org.opencontainers.image.title="Sovereign Portal C-137" \
      org.opencontainers.image.description="Rick C-137 Sovereign AI Portal Interface // Twin Portal" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /usr/share/nginx/html

# Default nginx landing assets are not needed.
RUN rm -rf ./*

COPY index.html          ./
COPY offline.html        ./
COPY manifest.webmanifest ./
COPY sw.js               ./
COPY robots.txt          ./
COPY icons               ./icons

COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN touch /var/run/nginx.pid \
 && chown -R nginx:nginx /var/run/nginx.pid /var/cache/nginx /usr/share/nginx/html

USER nginx

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
