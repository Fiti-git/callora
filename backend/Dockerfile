FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install
RUN apt-get update -y && apt-get install -y openssl

COPY prisma ./prisma/
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

EXPOSE 4000

CMD ["npm", "start"]
