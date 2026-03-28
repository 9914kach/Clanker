# Bygg från repots rot: docker build -f bots/discord-bot/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo

# Kopiera bara package-filer först — npm ci cachas så länge de inte ändras.
COPY package.json package-lock.json ./
COPY bots/discord-bot/package.json ./bots/discord-bot/
COPY apps/discord-hub-api/package.json ./apps/discord-hub-api/
COPY apps/discord-hub-web/package.json ./apps/discord-hub-web/
COPY apps/dev-tools-web/package.json ./apps/dev-tools-web/
RUN npm ci

# Kopiera källkod och bygg.
COPY bots/discord-bot ./bots/discord-bot
RUN npm run build -w discord-bot

FROM node:22-alpine
WORKDIR /app
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/bots/discord-bot/dist ./dist
COPY --from=build /repo/bots/discord-bot/package.json ./package.json
CMD ["node", "dist/index.js"]
