#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
  echo "Do not run this script as root. Run it as the user that will own the synced folder (e.g. pi)."
  exit 1
fi

echo "Syncthing Raspberry Pi setup"
echo "User: $(whoami)"
echo ""

if ! command -v apt-get >/dev/null 2>&1; then
  echo "apt-get not found. This script assumes Raspberry Pi OS / Debian."
  exit 1
fi

echo "Installing syncthing..."
sudo apt-get update -y
sudo apt-get install -y syncthing

echo ""
echo "Enabling syncthing as a system service for this user (recommended on Pi)."
echo "This uses the packaged unit: syncthing@<user>.service"
sudo systemctl enable --now "syncthing@$(whoami).service"

echo ""
echo "Syncthing should now be running."
echo "GUI (from your LAN): http://<pi-ip>:8384"
echo ""
echo "If you want to bind the GUI to your LAN interface (instead of localhost), edit:"
echo "  ~/.config/syncthing/config.xml"
echo "and change the <gui><address> from 127.0.0.1:8384 to 0.0.0.0:8384 (or your LAN IP)."
echo ""
echo "Next steps (GUI):"
echo "1) Copy the Pi Device ID from the GUI and add it on Windows."
echo "2) Accept the shared folder from Windows, set it to Receive Only."
echo "3) Pick a target path like /home/$(whoami)/dev/Clanker"

