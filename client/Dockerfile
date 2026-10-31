# Multi-stage build for React Client (nginx static) (X-04)
FROM node:20-alpine AS builder

WORKDIR /app

COPY client/package*.json ./
RUN npm ci

COPY client/ ./

ARG VITE_API_BASE_URL=http://localhost:4000/api
ARG VITE_WS_URL=http://localhost:4000
ARG VITE_MOCK_DOMAINS=

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_WS_URL=$VITE_WS_URL \
    VITE_MOCK_DOMAINS=$VITE_MOCK_DOMAINS

RUN npm run build

# Nginx static server stage
FROM nginx:alpine

COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
