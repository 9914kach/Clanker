# Driftformsstyrd kontrollmatris

## Iterationsregel (obligatorisk)
Inför **varje iteration**:
1. Välj exakt en rad i matrisen (en driftform) som iterationens fokus.
2. Referera till vald rad i rapportens första avsnitt med formuleringen:
   - `Vald rad i Driftformsstyrd kontrollmatris: <Driftform>`
3. Motivera kort varför just den raden prioriteras i iterationen.

## Kontrollmatris

| Driftform | Primär konfigkälla | Kommandon för inventory | Vanliga fellägen | Obligatoriska säkerhetskontroller | Rollback-metod |
|---|---|---|---|---|---|
| **Bare-metal** | `/etc` (systemfiler), systemd-unitfiler, CM-verktyg (Ansible/Puppet) | `uname -a`, `systemctl list-units --type=service`, `ss -tulpen`, `lsblk -f`, `cat /etc/os-release` | Konfigdrift efter manuell ändring, paketkonflikter, felaktiga systemd-dependencys, disk full/inode-brist | Härdning av SSH (nyckel, ingen root-login), patchnivå, brandvägg (nftables/ufw), FIM/loggning, backup-verifiering | Återställ konfig från Git/CM, `systemctl revert`, paket-downgrade, återläsning av snapshot/backup |
| **Docker** | `Dockerfile`, `docker-compose.yml`, image-taggar/digests, runtime-env | `docker ps -a`, `docker inspect <container>`, `docker compose config`, `docker images --digests`, `docker network ls` | Tag-drift (`latest`), saknade secrets/env, fel port/publicering, volymrättigheter, restart-loop | Kör rootless/least privilege, skanna images (CVE), signering/digest-pin, secrets-hantering, begränsa capabilities/seccomp | Rulla tillbaka till tidigare image digest/tagg, `docker compose down && docker compose up -d` med tidigare version |
| **Kubernetes** | GitOps-manifest (Helm/Kustomize), cluster policies, ConfigMaps/Secrets | `kubectl get all -A`, `kubectl get deploy,sts,ds -A -o wide`, `kubectl describe <resurs>`, `kubectl get events -A --sort-by=.lastTimestamp`, `kubectl top pods -A` | Felaktig rollout, probe-fel, policy-deny (OPA/PSA), resursbrist/evictions, nätverks-/DNS-fel | RBAC-minimering, admission policies, image policy + signering, network policies, secret encryption at rest, audit-loggar | `kubectl rollout undo deploy/<namn>`, återställ tidigare Helm release, revert i GitOps och synka |
| **VM/LXC** | Hypervisor-konfig (Proxmox/libvirt), cloud-init, gäst-OS-konfig | `qm list`/`virsh list --all`, `pct list`, `virsh dominfo <vm>`, `lxc-info -n <ct>`, `cloud-init status` | Snapshot-sprawl, fel virtio/drivrutin, klockdrift, överprovisionering CPU/RAM, nätverks-bridge-fel | Segmentering mellan gäster, uppdaterad hypervisor, säkra templates/golden images, backup + restore-test, åtkomstkontroll till managementplan | Revert till snapshot, återställ från template/backup, live-migrate tillbaka, rollback av cloud-init/provisionering |

## Rapportmall (första avsnitt)
Använd detta block i början av varje iterationsrapport:

```md
## Iterationsfokus
Vald rad i Driftformsstyrd kontrollmatris: <Driftform>
Prioriteringsmotiv: <1–3 meningar>
Påverkad konfigkälla: <Primär konfigkälla>
Planerad rollback om ändring misslyckas: <Rollback-metod>
```
