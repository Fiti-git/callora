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
COPY services/auth-service/package.json services/auth-service/package-lock.json* services/auth-service/
RUN cd services/auth-service && npm install --no-audit --no-fund --ignore-scripts
COPY services/auth-service/ services/auth-service/
RUN cd services/auth-service && npm run build
RUN rm -f services/auth-service/node_modules/@callora/shared && mkdir -p services/auth-service/node_modules/@callora/shared && cp -r shared/dist services/auth-service/node_modules/@callora/shared/dist && cp shared/package.json services/auth-service/node_modules/@callora/shared/package.json && cp -r shared/src/prisma/generated services/auth-service/node_modules/@callora/shared/dist/prisma/generated

FROM node:20-bookworm-slim
RUN apt-get -o Acquire::Check-Valid-Until=false -o Acquire::Check-Date=false update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /repo/services/auth-service/dist ./dist
COPY --from=builder /repo/services/auth-service/node_modules ./node_modules
COPY --from=builder /repo/services/auth-service/package.json ./package.json
EXPOSE 4001
CMD ["node", "dist/index.js"]
