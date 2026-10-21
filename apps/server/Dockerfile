# Multi-stage build for CreditFlow Node/Express Server (X-04)
FROM node:20-alpine AS builder

WORKDIR /app

COPY apps/server/package*.json ./
RUN npm ci

COPY apps/server/ ./
COPY seed_data.json ./seed_data.json

RUN npm run build

# Runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=4000

COPY apps/server/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/seed_data.json ./seed_data.json
COPY apps/server/scripts ./scripts

EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD wget -q --spider http://localhost:4000/api/health || exit 1

CMD ["node", "dist/index.js"]
