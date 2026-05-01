# syntax=docker/dockerfile:1.7
# Callora compact deploy — `edge` bundle image.
# Build context: REPO ROOT (not this directory).
#
# Image-size target: < 180 MB.
# Strategy: alpine base, multi-stage, prod-only deps, drop test/types.
#
# Build:  docker build -f bundles/edge/Dockerfile -t callora/edge:latest .

FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++ openssl
WORKDIR /repo

# Workspace manifests first for cache reuse.
COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY services/api-gateway/package.json services/api-gateway/
COPY services/auth-service/package.json services/auth-service/
COPY services/platform-service/package.json services/platform-service/
COPY bundles/edge/package.json bundles/edge/

# Install all workspace deps once (npm 9+ workspace install).
RUN npm install --ignore-scripts --no-audit --no-fund

# Copy sources for shared + the 3 services + bundle.
COPY shared/ shared/
COPY services/api-gateway/ services/api-gateway/
COPY services/auth-service/ services/auth-service/
COPY services/platform-service/ services/platform-service/
COPY bundles/edge/ bundles/edge/

# Generate prisma client + build everything.
RUN cd shared && npx prisma generate --schema=src/prisma/schema.prisma && npm run build \
 && cd ../services/api-gateway && npm run build \
 && cd ../auth-service && npm run build \
 && cd ../platform-service && npm run build \
 && cd ../../bundles/edge && npm run build

# Prune dev dependencies for slim runtime image.
RUN npm prune --omit=dev --no-audit --no-fund

# ---- Runtime stage ------------------------------------------------------
FROM node:22-alpine
RUN apk add --no-cache openssl ca-certificates tini
WORKDIR /app
ENV NODE_ENV=production

# Bring across the workspace tree so workspace symlinks resolve at runtime.
COPY --from=builder /repo/package.json ./package.json
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/shared/package.json ./shared/package.json
COPY --from=builder /repo/shared/dist ./shared/dist
COPY --from=builder /repo/shared/src/prisma ./shared/src/prisma
COPY --from=builder /repo/services/api-gateway/package.json ./services/api-gateway/package.json
COPY --from=builder /repo/services/api-gateway/dist ./services/api-gateway/dist
COPY --from=builder /repo/services/auth-service/package.json ./services/auth-service/package.json
COPY --from=builder /repo/services/auth-service/dist ./services/auth-service/dist
COPY --from=builder /repo/services/platform-service/package.json ./services/platform-service/package.json
COPY --from=builder /repo/services/platform-service/dist ./services/platform-service/dist
COPY --from=builder /repo/bundles/edge/package.json ./bundles/edge/package.json
COPY --from=builder /repo/bundles/edge/dist ./bundles/edge/dist

EXPOSE 4000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--max-old-space-size=384", "bundles/edge/dist/index.js"]
