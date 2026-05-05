FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.worker.json ./package.json
RUN npm install --omit=dev \
  && npm cache clean --force

FROM node:22-bookworm-slim AS runner
RUN apt-get update \
  && apt-get install -y --no-install-recommends prusa-slicer \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.worker.json ./package.json
COPY tsconfig.json ./tsconfig.json
COPY lib ./lib
COPY worker ./worker

ENV NODE_ENV=production

CMD ["node_modules/.bin/tsx", "worker/index.ts"]
