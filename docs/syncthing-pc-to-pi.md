# Auto-synk Windows PC -> Raspberry Pi (Syncthing)

Mål: spara på PC och få filerna på Pi automatiskt, utan manuell sync.

## 1) Windows (PC)

Kör (PowerShell):

```powershell
.\scripts\syncthing-setup-windows.ps1 -Start -InstallAutostart
```

Om `winget` saknas: installera Syncthing manuellt och starta det, sedan öppna `http://localhost:8384`.

I Syncthing-GUI på Windows:
- `Actions -> Show ID` och notera din PC Device ID (bra för felsökning).
- `Add Remote Device`: lägg till Pi:ns Device ID.
- `Add Folder`:
  - Folder Path: repo-rooten `C:\Users\9914k\Dev\RaspberryPi\Clanker`
  - Folder Type: **Send Only**
  - Ignores: använd `.stignore` i repo-roten (Syncthing läser den automatiskt när foldern pekar på repo-rooten)

## 2) Raspberry Pi

SSH in på Pi och kör:

```bash
mkdir -p /home/pi/dev
cd /home/pi/dev
```

Installera + starta Syncthing-service för din användare genom att köra scriptet direkt (kopiera in det till Pi, eller kör det från den synkade foldern efter att du accepterat foldern i GUI):

```bash
chmod +x ./scripts/syncthing-setup-pi.sh
./scripts/syncthing-setup-pi.sh
```

I Syncthing-GUI på Pi:
- Kopiera Pi Device ID och lägg in på Windows (Remote Device).
- Acceptera foldern från Windows:
  - Folder Type: **Receive Only**
  - Folder Path: t.ex. `/home/pi/dev/Clanker`

Obs: på Pi är GUI ofta bundet till `127.0.0.1:8384` som default. För att nå den från din PC på LAN kan du behöva ändra GUI address i `~/.config/syncthing/config.xml`.

## 3) Ignore-regler

Repo-roten har en `.stignore` med rimliga defaults (t.ex. `.git/`, `**/node_modules/`, `dist/`, `build/`, caches, `*.log`, `.env*`).

Om du faktiskt behöver någon av de ignorerade mapparna på Pi för att köra/testa, ta bort just den raden ur `.stignore`.

## 4) Snabb test

1. Ändra och spara en fil på Windows.
2. Syncthing ska visa `Up to Date` på båda sidor efter någon sekund.
3. Verifiera att filen uppdaterats på Pi.
