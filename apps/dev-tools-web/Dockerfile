# Bygg från repots rot: docker build -f apps/dev-tools-web/Dockerfile .
# Hela repot (minus .dockerignore) behövs så Vite kan globba alla *.md vid build.
FROM node:22-alpine AS build
WORKDIR /repo
COPY . .
RUN npm ci && npm run build -w dev-tools-web

FROM nginx:1.27-alpine
COPY apps/dev-tools-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/dev-tools-web/dist /usr/share/nginx/html
EXPOSE 80
