# syntax=docker/dockerfile:1.7

# ────────────────────────────────────────────────────────────────────────────
# Architecture Notebook container
#
# WARNING: this server has no authentication. Only expose it on trusted
# networks, or front it with a reverse proxy that adds auth.
#
# Two stages:
#   1. web-builder: install pnpm deps + esbuild the browser bundle.
#   2. runtime: tiny image with only the TS source, the built bundle, and
#      Node 24's --experimental-strip-types. No runtime npm install — the
#      server uses only `node:*` built-ins.
# ────────────────────────────────────────────────────────────────────────────

FROM node:24-slim AS web-builder
WORKDIR /app

# Layer cache: deps first, then source.
COPY package.json pnpm-lock.yaml ./
RUN corepack enable \
 && corepack prepare pnpm@9.15.0 --activate \
 && pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY web ./web
COPY scripts ./scripts
RUN pnpm build:web


FROM node:24-slim AS runtime
WORKDIR /app

# Source files. No node_modules in the runtime image: the server itself uses
# only node:* built-ins, and the browser deps are already bundled into
# web/dist/main.js by the previous stage.
COPY package.json ./
COPY server ./server
COPY skill ./skill
COPY design ./design
COPY --from=web-builder /app/web/dist ./web/dist

ENV HOST=0.0.0.0 \
    PORT=8787 \
    DATA_DIR=/data \
    LOG_LEVEL=info \
    NODE_NO_WARNINGS=1

# Persistent notebooks. Mount with `-v <hostdir>:/data` to keep your work.
VOLUME ["/data"]

# Lightweight health check the container runtime can poll.
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

EXPOSE 8787

CMD ["node", "--experimental-strip-types", "server/index.ts"]
