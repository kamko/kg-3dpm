FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends prusa-slicer \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

ENV NODE_ENV=production

CMD ["npm", "run", "worker"]
