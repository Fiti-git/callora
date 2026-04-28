# Build context: repo root
FROM node:20-bookworm-slim AS shared-builder
WORKDIR /repo
COPY shared/package.json shared/package-lock.json* shared/
RUN cd shared && npm install --no-audit --no-fund --ignore-scripts
COPY shared/ shared/
RUN cd shared && npx prisma generate --schema=src/prisma/schema.prisma && npm run build

FROM node:20-bookworm-slim AS builder
WORKDIR /repo
COPY --from=shared-builder /repo/shared shared/
COPY services/platform-service/package.json services/platform-service/package-lock.json* services/platform-service/
RUN cd services/platform-service && npm install --no-audit --no-fund --ignore-scripts
COPY services/platform-service/ services/platform-service/
RUN cd services/platform-service && npm run build
RUN rm -f services/platform-service/node_modules/@callora/shared && mkdir -p services/platform-service/node_modules/@callora/shared && cp -r shared/dist services/platform-service/node_modules/@callora/shared/dist && cp shared/package.json services/platform-service/node_modules/@callora/shared/package.json && cp -r shared/src/prisma/generated services/platform-service/node_modules/@callora/shared/dist/prisma/generated

FROM node:20-bookworm-slim
RUN apt-get -o Acquire::Check-Valid-Until=false -o Acquire::Check-Date=false update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /repo/services/platform-service/dist ./dist
COPY --from=builder /repo/services/platform-service/node_modules ./node_modules
COPY --from=builder /repo/services/platform-service/package.json ./package.json
EXPOSE 4007
CMD ["node", "dist/index.js"]
