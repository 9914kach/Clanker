import {
  faLink,
  faPalette,
  faRotate,
  faUnlink,
  faUserGear,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Button } from "@clanker/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@clanker/ui/components/card";
import { apiUrl } from "@/config";
import { useHubLayout } from "@/hooks/use-hub-layout";
import type { LeagueRankedEntry } from "@/lib/league-format";

type LeagueRegion = "EUW" | "EUNE" | "NA" | "KR" | "BR";

type LeagueConnection = {
  riotId: string;
  tagLine: string;
  region: LeagueRegion;
  autoSync: boolean;
  rankPreference: "solo" | "flex";
  statusMessage: string;
  linkedAt: string;
  lastSyncRequestedAt: string | null;
};

type LeagueRecentMatch = {
  matchId: string;
  gameCreation: number;
  gameDurationSeconds: number;
  queueId: number;
  championName: string;
  kills: number;
  deaths: number;
  assists: number;
  totalCs: number;
  goldEarned: number;
  championLevel: number;
  win: boolean;
  lane: string;
  role: string;
  participantName: string;
};

type LeagueSyncSnapshot = {
  fetchedAt: string;
  account: {
    puuid: string;
    gameName: string;
    tagLine: string;
  };
  rankPreference: "solo" | "flex";
  preferredRank: LeagueRankedEntry | null;
  leagueEntries: LeagueRankedEntry[];
  recentMatches: LeagueRecentMatch[];
};

type LeagueStatusResponse = {
  connected: boolean;
  connection: LeagueConnection | null;
  sync: LeagueSyncSnapshot | null;
};

type LeagueForm = {
  riotId: string;
  tagLine: string;
  region: LeagueRegion;
  autoSync: boolean;
  rankPreference: "solo" | "flex";
  statusMessage: string;
};

const defaultLeagueForm: LeagueForm = {
  riotId: "",
  tagLine: "",
  region: "EUW",
  autoSync: true,
  rankPreference: "solo",
  statusMessage: "Ready for ranked grind.",
};

async function parseJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export default function ProfileSettingsPage() {
  const { me } = useHubLayout();
  const location = useLocation();
  const [leagueForm, setLeagueForm] = useState<LeagueForm>(defaultLeagueForm);
  const [leagueMessage, setLeagueMessage] = useState("");
  const [leagueBusy, setLeagueBusy] = useState(false);
  const [profileSettings, setProfileSettings] = useState({
    showOnlineStatus: true,
    showRank: true,
    shareChampionPool: false,
  });

  const refreshLeague = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/integrations/league/status"), {
        credentials: "include",
      });
      if (!res.ok) {
        return;
      }

      const data = await parseJson<LeagueStatusResponse>(res);
      if (!data) {
        return;
      }

      if (data.connection) {
        setLeagueForm({
          riotId: data.connection.riotId,
          tagLine: data.connection.tagLine,
          region: data.connection.region,
          autoSync: data.connection.autoSync,
          rankPreference: data.connection.rankPreference,
          statusMessage: data.connection.statusMessage,
        });
      }
    } catch {
      setLeagueMessage("Kunde inte läsa League-status just nu.");
    }
  }, []);

  useEffect(() => {
    if (me.status === "user") {
      void refreshLeague();
    }
  }, [me.status, refreshLeague]);

  useEffect(() => {
    if (location.hash !== "#league") {
      return;
    }
    const id = window.setTimeout(() => {
      document.getElementById("league")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
    return () => window.clearTimeout(id);
  }, [location.hash, location.pathname]);

  const submitLeagueConnect = async () => {
    setLeagueBusy(true);
    setLeagueMessage("");
    try {
      const res = await fetch(apiUrl("/api/integrations/league/connect"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leagueForm),
      });

      if (!res.ok) {
        const payload = await parseJson<{ error?: string }>(res);
        setLeagueMessage(payload?.error ?? "Kunde inte koppla League-kontot.");
        return;
      }

      const payload = await parseJson<
        LeagueStatusResponse & { message?: string }
      >(res);
      await refreshLeague();
      setLeagueMessage(payload?.message ?? "League-konto kopplat.");
    } catch {
      setLeagueMessage("Nätverksfel vid koppling av League-konto.");
    } finally {
      setLeagueBusy(false);
    }
  };

  const submitLeagueSync = async () => {
    setLeagueBusy(true);
    setLeagueMessage("");
    try {
      const res = await fetch(apiUrl("/api/integrations/league/sync"), {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        const payload = await parseJson<{ error?: string }>(res);
        setLeagueMessage(payload?.error ?? "Kunde inte köra synk.");
        return;
      }

      const payload = await parseJson<
        LeagueStatusResponse & { message?: string }
      >(res);
      await refreshLeague();
      setLeagueMessage(payload?.message ?? "League-data synkad.");
    } catch {
      setLeagueMessage("Nätverksfel vid synk.");
    } finally {
      setLeagueBusy(false);
    }
  };

  const submitLeagueDisconnect = async () => {
    setLeagueBusy(true);
    setLeagueMessage("");
    try {
      const res = await fetch(apiUrl("/api/integrations/league/disconnect"), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        setLeagueMessage("Kunde inte koppla bort League-kontot.");
        return;
      }

      setLeagueForm(defaultLeagueForm);
      setLeagueMessage("League-konto bortkopplat.");
    } catch {
      setLeagueMessage("Nätverksfel vid bortkoppling.");
    } finally {
      setLeagueBusy(false);
    }
  };

  if (me.status === "loading") {
    return <div className="mx-auto max-w-4xl px-5 py-10 text-muted-foreground">Laddar profil…</div>;
  }
  if (me.status === "guest") {
    return <Navigate to="/login" replace />;
  }
  if (me.status === "backend_error") {
    return (
      <div className="mx-auto max-w-lg px-5 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Backend nårs inte</CardTitle>
            <CardDescription>
              <code className="text-foreground">discord-hub-api</code> körs inte eller har avslutats.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>Starta API:t och ladda om sidan.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const profilePath = `/u/${encodeURIComponent(me.profile.id)}`;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Profilinställningar</h1>
        <p className="mt-2 text-muted-foreground">
          Koppla League, kör synk och styr vad som visas på din{" "}
          <Link to={profilePath} className="text-foreground underline-offset-4 hover:underline">
            publika profil
          </Link>
          . Rank och matcher visas på profilen efter lyckad synk.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FontAwesomeIcon icon={faPalette} /> Tema och färger
          </CardTitle>
          <CardDescription>
            Diagramfärger (chart-1–5) och primärknapp följer valt färgtema i temamenyn i sidhuvudet.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex max-w-md flex-col gap-3">
          <div
            className="ring-border flex h-2.5 overflow-hidden rounded-full ring-1"
            aria-hidden
          >
            <span className="min-w-0 flex-1 bg-chart-1" />
            <span className="min-w-0 flex-1 bg-chart-2" />
            <span className="min-w-0 flex-1 bg-chart-3" />
            <span className="min-w-0 flex-1 bg-chart-4" />
            <span className="min-w-0 flex-1 bg-chart-5" />
          </div>
          <p className="text-muted-foreground text-sm">
            Byt ljust/mörkt tema och accent där — inställningarna påverkar hela hubben, inklusive
            din publika profil.
          </p>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FontAwesomeIcon icon={faUserGear} /> Profil
            </CardTitle>
            <CardDescription>Grundinställningar för profilsidan.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <span>Visa online-status</span>
              <input
                type="checkbox"
                checked={profileSettings.showOnlineStatus}
                onChange={(e) =>
                  setProfileSettings((prev) => ({ ...prev, showOnlineStatus: e.target.checked }))
                }
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <span>Visa rank på profil</span>
              <input
                type="checkbox"
                checked={profileSettings.showRank}
                onChange={(e) =>
                  setProfileSettings((prev) => ({ ...prev, showRank: e.target.checked }))
                }
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <span>Dela champion pool</span>
              <input
                type="checkbox"
                checked={profileSettings.shareChampionPool}
                onChange={(e) =>
                  setProfileSettings((prev) => ({ ...prev, shareChampionPool: e.target.checked }))
                }
              />
            </label>
          </CardContent>
        </Card>

        <Card id="league" className="scroll-mt-28">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FontAwesomeIcon icon={faLink} /> Synka League of Legends
            </CardTitle>
            <CardDescription>Koppla konto och hämta rank samt senaste matcher via Riot API.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                Riot ID
                <input
                  type="text"
                  value={leagueForm.riotId}
                  onChange={(e) => setLeagueForm((prev) => ({ ...prev, riotId: e.target.value }))}
                  className="rounded-md border border-input bg-background px-3 py-2"
                  placeholder="t.ex. Faker"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Tagline
                <input
                  type="text"
                  value={leagueForm.tagLine}
                  onChange={(e) => setLeagueForm((prev) => ({ ...prev, tagLine: e.target.value }))}
                  className="rounded-md border border-input bg-background px-3 py-2"
                  placeholder="EUW"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Region
                <select
                  value={leagueForm.region}
                  onChange={(e) =>
                    setLeagueForm((prev) => ({ ...prev, region: e.target.value as LeagueRegion }))
                  }
                  className="rounded-md border border-input bg-background px-3 py-2"
                >
                  <option value="EUW">EUW</option>
                  <option value="EUNE">EUNE</option>
                  <option value="NA">NA</option>
                  <option value="KR">KR</option>
                  <option value="BR">BR</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Rank-källa
                <select
                  value={leagueForm.rankPreference}
                  onChange={(e) =>
                    setLeagueForm((prev) => ({
                      ...prev,
                      rankPreference: e.target.value as "solo" | "flex",
                    }))
                  }
                  className="rounded-md border border-input bg-background px-3 py-2"
                >
                  <option value="solo">Solo Queue</option>
                  <option value="flex">Flex Queue</option>
                </select>
              </label>
            </div>

            <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={leagueForm.autoSync}
                onChange={(e) => setLeagueForm((prev) => ({ ...prev, autoSync: e.target.checked }))}
              />
              Auto-synk när datahämtning aktiveras
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Statusmeddelande
              <input
                type="text"
                value={leagueForm.statusMessage}
                onChange={(e) =>
                  setLeagueForm((prev) => ({ ...prev, statusMessage: e.target.value }))
                }
                className="rounded-md border border-input bg-background px-3 py-2"
                placeholder="Ready for ranked grind."
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={leagueBusy} onClick={submitLeagueConnect}>
                <FontAwesomeIcon icon={faLink} data-icon="inline-start" />
                Koppla konto
              </Button>
              <Button type="button" variant="secondary" disabled={leagueBusy} onClick={submitLeagueSync}>
                <FontAwesomeIcon icon={faRotate} data-icon="inline-start" />
                Synka nu
              </Button>
              <Button type="button" variant="outline" disabled={leagueBusy} onClick={submitLeagueDisconnect}>
                <FontAwesomeIcon icon={faUnlink} data-icon="inline-start" />
                Koppla bort
              </Button>
            </div>

            {leagueMessage ? <p className="text-sm text-muted-foreground">{leagueMessage}</p> : null}
            <p className="text-muted-foreground text-xs">
              Snapshot lagras i minnet på servern tills omstart — detaljerad rank och matchhistorik
              visas på{" "}
              <Link to={profilePath} className="text-foreground underline-offset-4 hover:underline">
                din publika profil
              </Link>{" "}
              efter synk.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
