FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_DIR=/app/data

EXPOSE 3000

CMD ["npm", "run", "start"]
