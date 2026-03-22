FROM node:20-alpine AS builder

WORKDIR /app
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY frontend/package*.json ./frontend/
COPY scripts ./scripts

WORKDIR /app/frontend
RUN npm ci

COPY frontend/. ./
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app/frontend
ENV NODE_ENV=production

COPY --from=builder /app/frontend/.next/standalone ./
COPY --from=builder /app/frontend/.next/static ./.next/static
COPY --from=builder /app/frontend/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
