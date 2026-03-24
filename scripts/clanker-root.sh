#!/usr/bin/env bash
# Gemensam repots rot för Clanker-skript — source denna fil och anropa clanker_init_repo_root.
# Kräver att anroparen skickar sin egen skriptreferens (t.ex. "${BASH_SOURCE[0]:-$0}").

clanker_init_repo_root() {
  local src="${1:?clanker_init_repo_root: saknar skriptsökväg}"
  local real
  real="$(readlink -f "$src")"
  SCRIPT_DIR="$(cd "$(dirname "$real")" && pwd)"
  ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
  cd "$ROOT"
}
