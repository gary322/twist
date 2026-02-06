FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first for better caching. This Dockerfile expects repo-root build context.
COPY packages/messages/package.json packages/messages/package-lock.json packages/messages/tsconfig.json ./packages/messages/
COPY packages/blockchain-sdk/package.json packages/blockchain-sdk/package-lock.json packages/blockchain-sdk/tsconfig.json ./packages/blockchain-sdk/
COPY services/influencer-api/package.json services/influencer-api/package-lock.json services/influencer-api/tsconfig*.json ./services/influencer-api/

RUN npm --prefix packages/messages ci
COPY packages/messages/src ./packages/messages/src
RUN npm --prefix packages/messages run build

RUN npm --prefix packages/blockchain-sdk ci
COPY packages/blockchain-sdk/src ./packages/blockchain-sdk/src
RUN npm --prefix packages/blockchain-sdk run build

RUN npm --prefix services/influencer-api ci
COPY services/influencer-api/src ./services/influencer-api/src
COPY services/influencer-api/migrations ./services/influencer-api/migrations
RUN npm --prefix services/influencer-api run build

# Keep runtime images smaller by pruning devDependencies.
RUN npm --prefix services/influencer-api prune --omit=dev
RUN npm --prefix packages/messages prune --omit=dev
RUN npm --prefix packages/blockchain-sdk prune --omit=dev

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache dumb-init
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

COPY --from=builder --chown=nodejs:nodejs /app/services/influencer-api ./services/influencer-api
COPY --from=builder --chown=nodejs:nodejs /app/packages/messages ./packages/messages
COPY --from=builder --chown=nodejs:nodejs /app/packages/blockchain-sdk ./packages/blockchain-sdk

USER nodejs

EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
WORKDIR /app/services/influencer-api
CMD ["node", "dist/main.js"]
