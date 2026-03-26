FROM node:20-bookworm-slim AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/package*.json ./backend/
COPY scripts ./scripts

WORKDIR /app/backend
RUN npm ci

COPY backend/. ./
RUN npx prisma generate
RUN npm run build

FROM node:20-bookworm-slim AS runner

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY scripts ./scripts

WORKDIR /app/backend
COPY --from=builder /app/backend/node_modules ./node_modules
COPY backend/package*.json ./
COPY --from=builder /app/backend/dist ./dist
COPY backend/prisma ./prisma
COPY backend/data ./data
COPY backend/scripts ./scripts

EXPOSE 3001

CMD ["node", "dist/src/main.js"]
