# Discord hub — backend (`discord-hub-api`)

Här hamnar API:t som stödjer **discord-hubben** (t.ex. Node + Fastify/Hono) och pratar med PostgreSQL (`clanker-db` när Compose-profilen `db` är aktiv).

- Paketnamn i monorepot: **`discord-hub-api`** (`npm run <script> -w discord-hub-api` när du lagt till skript).
- I produktion: egen tjänst i rot-`docker-compose.yml` (t.ex. `discord-hub-api`) — frontenden (`discord-hub-web`) når den via `VITE_API_URL` och/eller reverse proxy till `/api`.
- En **separat** “Clanker hub” för serverstatus/homelab kan senare ligga i t.ex. `apps/clanker-hub-*` med egen Compose-profil så namnen inte krockar.
- `DATABASE_URL` ska alltid komma från miljö (aldrig committa hemligheter).
