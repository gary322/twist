# Multi-stage production build
FROM node:18-alpine AS builder

WORKDIR /app

# Copy workspace files
COPY package*.json ./
COPY lerna.json ./
COPY modules ./modules
COPY services ./services

# Install dependencies
RUN npm ci --only=production

# Build all services
RUN npm run build:all

# Production stage
FROM node:18-alpine

RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy built applications
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3000-3010

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
