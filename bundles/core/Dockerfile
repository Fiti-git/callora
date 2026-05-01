# syntax=docker/dockerfile:1.7
# Callora compact deploy — `core` bundle image.
# Build context: REPO ROOT.
# Image-size target: < 180 MB.

FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++ openssl
WORKDIR /repo

COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY services/campaign-service/package.json services/campaign-service/
COPY services/lead-service/package.json services/lead-service/
COPY services/crm-service/package.json services/crm-service/
COPY services/analytics-service/package.json services/analytics-service/
COPY services/platform-service/package.json services/platform-service/
COPY bundles/core/package.json bundles/core/

RUN npm install --ignore-scripts --no-audit --no-fund

COPY shared/ shared/
COPY services/campaign-service/ services/campaign-service/
COPY services/lead-service/ services/lead-service/
COPY services/crm-service/ services/crm-service/
COPY services/analytics-service/ services/analytics-service/
COPY services/platform-service/ services/platform-service/
COPY bundles/core/ bundles/core/

RUN cd shared && npx prisma generate --schema=src/prisma/schema.prisma && npm run build \
 && cd ../services/campaign-service && npm run build \
 && cd ../lead-service && npm run build \
 && cd ../crm-service && npm run build \
 && cd ../analytics-service && npm run build \
 && cd ../platform-service && npm run build \
 && cd ../../bundles/core && npm run build

RUN npm prune --omit=dev --no-audit --no-fund

# ---- Runtime stage ------------------------------------------------------
FROM node:22-alpine
RUN apk add --no-cache openssl ca-certificates tini
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /repo/package.json ./package.json
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/shared/package.json ./shared/package.json
COPY --from=builder /repo/shared/dist ./shared/dist
COPY --from=builder /repo/shared/src/prisma ./shared/src/prisma
COPY --from=builder /repo/services/campaign-service/package.json ./services/campaign-service/package.json
COPY --from=builder /repo/services/campaign-service/dist ./services/campaign-service/dist
COPY --from=builder /repo/services/lead-service/package.json ./services/lead-service/package.json
COPY --from=builder /repo/services/lead-service/dist ./services/lead-service/dist
COPY --from=builder /repo/services/crm-service/package.json ./services/crm-service/package.json
COPY --from=builder /repo/services/crm-service/dist ./services/crm-service/dist
COPY --from=builder /repo/services/analytics-service/package.json ./services/analytics-service/package.json
COPY --from=builder /repo/services/analytics-service/dist ./services/analytics-service/dist
COPY --from=builder /repo/services/platform-service/package.json ./services/platform-service/package.json
COPY --from=builder /repo/services/platform-service/dist ./services/platform-service/dist
COPY --from=builder /repo/bundles/core/package.json ./bundles/core/package.json
COPY --from=builder /repo/bundles/core/dist ./bundles/core/dist

EXPOSE 4002
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--max-old-space-size=384", "bundles/core/dist/index.js"]
