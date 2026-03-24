#!/usr/bin/env bash
# Delad logik för Vite (npm run dev:all) — används av clanker-run och clanker-kill.
# Kräver att anroparen satt ROOT till repots rot och kört cd "$ROOT".

CLANKER_VITE_PIDFILE="${ROOT:?}/.clanker/vite-dev.pid"
CLANKER_VITE_LOG="${ROOT}/.clanker/vite-dev.log"

clanker_load_dotenv() {
  if [[ -f "${ROOT}/.env" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "${ROOT}/.env"
    set +a
  fi
}

clanker_vite_start() {
  [[ "${CLANKER_VITE_DEV:-}" == "1" ]] || return 0

  mkdir -p "${ROOT}/.clanker"

  if ! command -v npm >/dev/null 2>&1; then
    echo "clanker-run: CLANKER_VITE_DEV=1 men npm finns inte på PATH." >&2
    return 0
  fi

  if [[ ! -d "${ROOT}/node_modules" ]]; then
    echo "clanker-run: CLANKER_VITE_DEV=1 men ${ROOT}/node_modules saknas — kör npm install i repots rot." >&2
    return 0
  fi

  if [[ -f "$CLANKER_VITE_PIDFILE" ]]; then
    local old
    old="$(<"$CLANKER_VITE_PIDFILE")"
    if [[ -n "$old" ]] && kill -0 "$old" 2>/dev/null; then
      echo "clanker-run: Vite dev körs redan (PID $old), hoppar över start." >&2
      return 0
    fi
    rm -f "$CLANKER_VITE_PIDFILE"
  fi

  : >"$CLANKER_VITE_LOG"
  cd "$ROOT"

  if command -v setsid >/dev/null 2>&1; then
    setsid npm run dev:all >>"$CLANKER_VITE_LOG" 2>&1 &
  else
    echo "clanker-run: varning: setsid saknas — Vite stoppas kanske inte helt med clanker-kill; installera util-linux." >&2
    npm run dev:all >>"$CLANKER_VITE_LOG" 2>&1 &
  fi

  local pid=$!
  echo "$pid" >"$CLANKER_VITE_PIDFILE"
  echo "clanker-run: Vite dev startad (PID $pid, processgrupp via setsid om tillgänglig). Logg: ${CLANKER_VITE_LOG}"
}

clanker_vite_stop() {
  [[ -f "$CLANKER_VITE_PIDFILE" ]] || return 0

  local pid
  pid="$(tr -d '[:space:]' <"$CLANKER_VITE_PIDFILE")"
  rm -f "$CLANKER_VITE_PIDFILE"

  if [[ -z "$pid" ]] || ! kill -0 "$pid" 2>/dev/null; then
    echo "clanker-kill: Vite-PID-fil fanns men processen var redan borta (städad)."
    return 0
  fi

  echo "clanker-kill: stoppar Vite dev (PID $pid)..."
  if kill -- -"$pid" 2>/dev/null; then
    :
  elif kill -TERM "$pid" 2>/dev/null; then
    :
  fi

  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.3
  done

  if kill -0 "$pid" 2>/dev/null; then
    echo "clanker-kill: Vite svarade inte på SIGTERM, skickar SIGKILL till processgrupp..."
    kill -KILL -- -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
  fi
}
