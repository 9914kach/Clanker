# Discord hub — frontend (`discord-hub-web`)

Vite + React + TypeScript för discord-gängets gemensamma verktyg.

## Utveckling

Från repots rot:

```bash
npm install
npm run dev
```

Öppna den URL Vite skriver ut (vanligtvis `http://localhost:5173`).

## Miljövariabler

Kopiera `.env.example` till `.env` i denna mapp vid behov. `VITE_API_URL` används när backend ligger på annan bas-URL; annars lämna tom och använd `/api` (Vite proxar till `127.0.0.1:3001` i utveckling).

## Produktion på Pi

```bash
cd ~/apps/Clanker
docker compose --profile discord up -d --build discord-hub-web
```

Sidan når du på `http://<pi-ip>:4173` (eller porten du sätter med `DISCORD_HUB_WEB_PORT` i `.env`).

TLS och domän: sätt **Caddy** eller **nginx** framför containern på värden, eller en reverse proxy på routern, med certifikat mot din domän.

## Databas

PostgreSQL startas separat med profilen `db` (se rot-`docker-compose.yml`). Anslutningssträng för API på samma Docker-värd: `postgresql://USER:PASS@clanker-db:5432/DB`.
