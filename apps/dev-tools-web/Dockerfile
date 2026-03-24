# Bygg från repots rot: docker build -f apps/dev-tools-web/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json ./
COPY apps/dev-tools-web/package.json apps/dev-tools-web/
RUN npm install
COPY apps/dev-tools-web apps/dev-tools-web
RUN npm run build -w dev-tools-web

FROM nginx:1.27-alpine
COPY apps/dev-tools-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/dev-tools-web/dist /usr/share/nginx/html
EXPOSE 80
