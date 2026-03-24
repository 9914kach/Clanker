# Bygg från repots rot: docker build -f apps/discord-hub-web/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json ./
COPY apps/discord-hub-web/package.json apps/discord-hub-web/
RUN npm install
COPY apps/discord-hub-web apps/discord-hub-web
RUN npm run build -w discord-hub-web

FROM nginx:1.27-alpine
COPY apps/discord-hub-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/discord-hub-web/dist /usr/share/nginx/html
EXPOSE 80
