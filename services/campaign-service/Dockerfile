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
COPY services/campaign-service/package.json services/campaign-service/package-lock.json* services/campaign-service/
RUN cd services/campaign-service && npm install --no-audit --no-fund --ignore-scripts
COPY services/campaign-service/ services/campaign-service/
RUN cd services/campaign-service && npm run build
RUN rm -f services/campaign-service/node_modules/@callora/shared && mkdir -p services/campaign-service/node_modules/@callora/shared && cp -r shared/dist services/campaign-service/node_modules/@callora/shared/dist && cp shared/package.json services/campaign-service/node_modules/@callora/shared/package.json && cp -r shared/src/prisma/generated services/campaign-service/node_modules/@callora/shared/dist/prisma/generated

FROM node:20-bookworm-slim
RUN apt-get -o Acquire::Check-Valid-Until=false -o Acquire::Check-Date=false update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /repo/services/campaign-service/dist ./dist
COPY --from=builder /repo/services/campaign-service/node_modules ./node_modules
COPY --from=builder /repo/services/campaign-service/package.json ./package.json
EXPOSE 4002
CMD ["node", "dist/index.js"]
