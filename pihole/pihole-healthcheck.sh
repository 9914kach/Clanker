#!/usr/bin/env bash
set -u

# Första argumentet: Pi-holes IP (exempel 192.168.1.50 om du inte anger något).
PIHOLE_IP="${1:-192.168.1.50}"
SSH_HOST="${2:-localhost}"
SKIP_SSH="${3:-false}"

ok() { printf "\033[32m[OK]\033[0m %s\n" "$1"; }
warn() { printf "\033[33m[WARN]\033[0m %s\n" "$1"; }
fail() { printf "\033[31m[FAIL]\033[0m %s\n" "$1"; }
have_cmd() { command -v "$1" >/dev/null 2>&1; }

dns_query() {
  local domain="$1"
  local server="$2"

  if have_cmd nslookup; then
    nslookup "$domain" "$server" 2>&1 || true
    return 0
  fi
  if have_cmd dig; then
    dig @"$server" "$domain" +short 2>&1 || true
    return 0
  fi
  if have_cmd host; then
    host "$domain" "$server" 2>&1 || true
    return 0
  fi

  echo "ERROR: Ingen DNS-klient hittades (installera dnsutils eller bind9-host)." 
}

echo "Pi-hole healthcheck startar..."
echo "DNS server: ${PIHOLE_IP}"
echo

# 1) Tillaten doman ska ge riktig IPv4 (inte 0.0.0.0)
google_out="$(dns_query google.com "${PIHOLE_IP}")"
if [[ "${google_out}" =~ ([0-9]{1,3}\.){3}[0-9]{1,3} ]] && [[ ! "${google_out}" =~ 0\.0\.0\.0 ]]; then
  ok "google.com resolvear normalt"
elif [[ "${google_out}" == *"ERROR: Ingen DNS-klient hittades"* ]]; then
  warn "Kunde inte testa DNS: nslookup/dig/host saknas"
  echo "${google_out}"
else
  fail "google.com ser inte frisk ut"
  echo "${google_out}"
fi

# 2) Blockerad doman ska ge block-svar
flurry_out="$(dns_query flurry.com "${PIHOLE_IP}")"
if [[ "${flurry_out}" =~ 0\.0\.0\.0 ]] || [[ "${flurry_out}" =~ NXDOMAIN ]] || [[ "${flurry_out}" =~ (^|[[:space:]])::($|[[:space:]]) ]] || [[ "${flurry_out}" =~ 0:0:0:0:0:0:0:0 ]]; then
  ok "flurry.com blockeras"
elif [[ "${flurry_out}" == *"ERROR: Ingen DNS-klient hittades"* ]]; then
  warn "Kunde inte testa blockering: nslookup/dig/host saknas"
  echo "${flurry_out}"
else
  fail "flurry.com verkar inte blockeras"
  echo "${flurry_out}"
fi

# 3) SSH-koll av container (valfri)
if [[ "${SKIP_SSH}" != "true" ]]; then
  echo
  if [[ "${SSH_HOST}" == "localhost" || "${SSH_HOST}" == "127.0.0.1" ]]; then
    echo "Kontrollerar container lokalt..."
    remote_out="$(docker inspect -f '{{.State.Status}}' clanker-pihole 2>/dev/null || echo missing)"
  else
    echo "Kontrollerar container via SSH (${SSH_HOST})..."
    remote_out="$(ssh "${SSH_HOST}" "docker inspect -f '{{.State.Status}}' clanker-pihole 2>/dev/null || echo missing" 2>&1 || true)"
  fi

  if [[ "${remote_out}" =~ running ]]; then
    ok "Docker-container 'clanker-pihole' ar running"
  elif [[ "${remote_out}" =~ missing ]]; then
    warn "Kunde inte hitta container 'clanker-pihole'"
  else
    warn "SSH/container-koll gav: ${remote_out}"
  fi
fi

echo
echo "Klar."
