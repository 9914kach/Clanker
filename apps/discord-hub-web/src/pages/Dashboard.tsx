import {
  faArrowRightFromBracket,
  faGamepad,
  faLink,
  faRotate,
  faShieldHalved,
  faTrophy,
  faUnlink,
  faUserGear,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@clanker/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@clanker/ui/components/card";
import { apiUrl } from "@/config";
import {
  accentColorToHex,
  discordAvatarUrl,
  discordBannerUrl,
} from "@/lib/discordCdn";

type MeProfile = {
  id: string;
  username: string;
  avatar: string | null;
  global_name: string | null;
  banner: string | null;
  accent_color: number | null;
};

type MeState =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "user"; profile: MeProfile }
  | { status: "backend_error" };

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

type LeagueStatusResponse = {
  connected: boolean;
  connection: LeagueConnection | null;
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

export default function DashboardPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<MeState>({ status: "loading" });
  const [leagueForm, setLeagueForm] = useState<LeagueForm>(defaultLeagueForm);
  const [leagueStatus, setLeagueStatus] = useState<LeagueStatusResponse | null>(null);
  const [leagueMessage, setLeagueMessage] = useState("");
  const [leagueBusy, setLeagueBusy] = useState(false);
  const [profileSettings, setProfileSettings] = useState({
    showOnlineStatus: true,
    showRank: true,
    shareChampionPool: false,
  });

  const refreshMe = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/auth/me"), { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as MeProfile;
        setMe({ status: "user", profile: data });
      } else if (res.status === 401) {
        setMe({ status: "guest" });
      } else {
        setMe({ status: "backend_error" });
      }
    } catch {
      setMe({ status: "backend_error" });
    }
  }, []);

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

      setLeagueStatus(data);
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
    void refreshMe();
    void refreshLeague();
  }, [refreshLeague, refreshMe]);

  const logout = async () => {
    await fetch(apiUrl("/api/auth/logout"), {
      method: "POST",
      credentials: "include",
    });
    navigate("/login", { replace: true });
  };

  const accountHealth = useMemo(() => {
    const hasLinkedLeague = leagueStatus?.connection !== null;
    const score =
      (profileSettings.showOnlineStatus ? 30 : 0) +
      (profileSettings.showRank ? 30 : 0) +
      (hasLinkedLeague ? 40 : 0);

    if (score >= 80) return "Klar";
    if (score >= 40) return "På gång";
    return "Behöver setup";
  }, [leagueStatus?.connection, profileSettings.showOnlineStatus, profileSettings.showRank]);

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

      setLeagueMessage("League-konto kopplat. Redo för framtida datainsamling.");
      await refreshLeague();
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

      setLeagueMessage("Synk begärd. Nästa steg är att ansluta Riot API-data.");
      await refreshLeague();
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

      setLeagueMessage("League-konto bortkopplat.");
      await refreshLeague();
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
            <CardDescription>Kontrollera att discord-hub-api körs.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { profile } = me;
  const displayName = profile.global_name ?? profile.username;
  const accentCoverStyle: CSSProperties | undefined =
    !profile.banner && profile.accent_color !== null
      ? { backgroundColor: accentColorToHex(profile.accent_color) }
      : undefined;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8">
      <section className="relative">
        <div className="relative min-h-[132px] overflow-hidden rounded-xl border border-border shadow-sm">
          <div
            className={`absolute inset-0 ${profile.banner || profile.accent_color !== null ? "" : "bg-muted"}`}
            style={accentCoverStyle}
          >
            {profile.banner ? (
              <img
                src={discordBannerUrl(profile.id, profile.banner)}
                alt=""
                className="h-full w-full object-cover"
                decoding="async"
              />
            ) : null}
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/30 to-black/80" aria-hidden />

          <motion.div
            className="relative z-10 flex min-h-[132px] flex-wrap items-end justify-between gap-4 px-4 pb-4 pt-6 sm:px-6"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="flex min-w-0 items-center gap-4">
              <img
                src={discordAvatarUrl(profile.id, profile.avatar, 128)}
                alt={displayName}
                width={112}
                height={112}
                className="size-24 shrink-0 rounded-full object-cover shadow-lg ring-4 ring-white/30 sm:size-28"
                decoding="async"
              />
              <div className="flex min-w-0 flex-col gap-1 pb-1">
                <p className="truncate text-2xl font-semibold tracking-tight text-white">{displayName}</p>
                <p className="truncate font-mono text-sm text-white/80">@{profile.username}</p>
                <p className="text-xs text-white/70">Profilstatus: {accountHealth}</p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/15 hover:text-white"
              aria-label="Logga ut"
              onClick={logout}
            >
              <FontAwesomeIcon icon={faArrowRightFromBracket} />
            </Button>
          </motion.div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><FontAwesomeIcon icon={faShieldHalved} /> Status</CardTitle>
            <CardDescription>Snabbstatus för kontot.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>Discord inloggning: Aktiv</p>
            <p>League koppling: {leagueStatus?.connected ? "Aktiv" : "Inte kopplad"}</p>
            <p>Integritetsläge: {profileSettings.shareChampionPool ? "Delar champion pool" : "Privat"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><FontAwesomeIcon icon={faGamepad} /> Spel</CardTitle>
            <CardDescription>Förbered plats för speldata.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>Favoritläge: Ranked</p>
            <p>Rankkälla: {leagueForm.rankPreference === "solo" ? "Solo Queue" : "Flex Queue"}</p>
            <p>Region: {leagueForm.region}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><FontAwesomeIcon icon={faUserGear} /> Mer profildata</CardTitle>
            <CardDescription>Extra datafält för framtida moduler.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>Discord-ID: {profile.id}</p>
            <p>Visningsnamn: {displayName}</p>
            <p>Senaste sync: {leagueStatus?.connection?.lastSyncRequestedAt ?? "Inte körd ännu"}</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Inställningar</CardTitle>
            <CardDescription>Förbered grundinställningar för profilsidan.</CardDescription>
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FontAwesomeIcon icon={faLink} /> Synka League of Legends</CardTitle>
            <CardDescription>Koppla konto så vi kan hämta data i nästa steg.</CardDescription>
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
                  onChange={(e) => setLeagueForm((prev) => ({ ...prev, region: e.target.value as LeagueRegion }))}
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
                    setLeagueForm((prev) => ({ ...prev, rankPreference: e.target.value as "solo" | "flex" }))
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
                Begär synk
              </Button>
              <Button type="button" variant="outline" disabled={leagueBusy} onClick={submitLeagueDisconnect}>
                <FontAwesomeIcon icon={faUnlink} data-icon="inline-start" />
                Koppla bort
              </Button>
            </div>

            {leagueMessage ? <p className="text-sm text-muted-foreground">{leagueMessage}</p> : null}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FontAwesomeIcon icon={faTrophy} /> Roadmap för hämtning av LoL-data</CardTitle>
          <CardDescription>Nästa implementation kan byggas direkt ovanpå denna grund.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>1. Lagra koppling per användare i databas (nu ligger den i minne).</p>
          <p>2. Koppla Riot API med server-side nyckel och rate limit-hantering.</p>
          <p>3. Hämta rank, senaste matcher och champion-statistik i en separat worker.</p>
          <p>4. Cacha data + visa senaste uppdatering på profilsidan.</p>
        </CardContent>
      </Card>
    </div>
  );
}
