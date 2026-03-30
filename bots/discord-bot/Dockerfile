# Bygg från repots rot: docker build -f bots/discord-bot/Dockerfile .
# @discordjs/voice ≥0.19 requires Node ≥22.12.0 (DAVE / e2ee).
FROM node:22.12-alpine AS build
WORKDIR /repo

# Kopiera bara package-filer först — npm ci cachas så länge de inte ändras.
COPY package.json package-lock.json ./
COPY bots/discord-bot/package.json ./bots/discord-bot/
COPY apps/discord-hub-api/package.json ./apps/discord-hub-api/
COPY apps/discord-hub-web/package.json ./apps/discord-hub-web/
COPY apps/dev-tools-web/package.json ./apps/dev-tools-web/
COPY packages/hub-pg-migrate/package.json ./packages/hub-pg-migrate/
COPY packages/ui/package.json ./packages/ui/
# youtube-dl-exec preinstall checks for python3; Alpine Node image has none — binary is fetched in postinstall.
ENV YOUTUBE_DL_SKIP_PYTHON_CHECK=1
RUN npm ci

# Kopiera källkod och bygg (hub-pg-migrate krävs av discord-bot).
COPY packages/hub-pg-migrate ./packages/hub-pg-migrate
COPY bots/discord-bot ./bots/discord-bot
COPY apps/discord-hub-api/migrations ./apps/discord-hub-api/migrations
RUN npm run build --prefix packages/hub-pg-migrate && npm run build -w discord-bot

FROM node:22.12-alpine
WORKDIR /app
# Symlink @clanker/hub-pg-migrate → ../../packages/hub-pg-migrate kräver att packages/ finns i imagen.
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/hub-pg-migrate ./packages/hub-pg-migrate
COPY --from=build /repo/apps/discord-hub-api/migrations ./migrations
COPY --from=build /repo/bots/discord-bot/dist ./dist
COPY --from=build /repo/bots/discord-bot/package.json ./package.json
CMD ["node", "dist/index.js"]
