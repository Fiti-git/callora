# syntax=docker/dockerfile:1.7
# Callora compact deploy — `io` bundle image.
# Build context: REPO ROOT.
# Image-size target: < 180 MB.

FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++ openssl
WORKDIR /repo

COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY services/calling-service/package.json services/calling-service/
COPY services/billing-service/package.json services/billing-service/
COPY services/notification-service/package.json services/notification-service/
COPY bundles/io/package.json bundles/io/

RUN npm install --ignore-scripts --no-audit --no-fund

COPY shared/ shared/
COPY services/calling-service/ services/calling-service/
COPY services/billing-service/ services/billing-service/
COPY services/notification-service/ services/notification-service/
COPY bundles/io/ bundles/io/

RUN cd shared && npx prisma generate --schema=src/prisma/schema.prisma && npm run build \
 && cd ../services/calling-service && npm run build \
 && cd ../billing-service && npm run build \
 && cd ../notification-service && npm run build \
 && cd ../../bundles/io && npm run build

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
COPY --from=builder /repo/services/calling-service/package.json ./services/calling-service/package.json
COPY --from=builder /repo/services/calling-service/dist ./services/calling-service/dist
COPY --from=builder /repo/services/billing-service/package.json ./services/billing-service/package.json
COPY --from=builder /repo/services/billing-service/dist ./services/billing-service/dist
COPY --from=builder /repo/services/notification-service/package.json ./services/notification-service/package.json
COPY --from=builder /repo/services/notification-service/dist ./services/notification-service/dist
COPY --from=builder /repo/bundles/io/package.json ./bundles/io/package.json
COPY --from=builder /repo/bundles/io/dist ./bundles/io/dist

EXPOSE 4004
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--max-old-space-size=384", "bundles/io/dist/index.js"]
