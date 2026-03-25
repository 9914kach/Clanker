import { faGamepad, faShieldHalved, faUserGear } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@clanker/ui/components/card";
import { apiUrl } from "@/config";
import { useHubLayout } from "@/hooks/use-hub-layout";

const HUB_GUILD_ID = import.meta.env.VITE_DISCORD_HUB_GUILD_ID?.trim() ?? "";

type GuildSummaryResponse = {
  guild: {
    id: string;
    name: string;
    icon: string | null;
    approximate_member_count: number | null;
    approximate_presence_count: number | null;
  };
  channel_count: number;
};

type GuildLiveResponse = {
  guild_id: string;
  gateway_connected: boolean;
  gateway_degraded: boolean;
  gateway_degraded_reason: string | null;
  last_event_at: string | null;
  voice_users: { user_id: string; channel_id: string | null }[];
};

type GuildWidgetData = {
  summary: GuildSummaryResponse | null;
  live: GuildLiveResponse | null;
  summaryError: string | null;
  liveError: string | null;
};

export default function DashboardPage() {
  const { me } = useHubLayout();
  const [guildWidget, setGuildWidget] = useState<GuildWidgetData>({
    summary: null,
    live: null,
    summaryError: null,
    liveError: null,
  });

  useEffect(() => {
    if (me.status !== "user" || !HUB_GUILD_ID) {
      return;
    }
    const ac = new AbortController();

    const readError = async (res: Response): Promise<string> => {
      try {
        const j = (await res.json()) as { error?: string; code?: string };
        if (typeof j.error === "string") {
          return j.code ? `${j.error} (${j.code})` : j.error;
        }
      } catch {
        /* ignore */
      }
      return res.statusText || `HTTP ${res.status}`;
    };

    const fetchSummary = async () => {
      try {
        const res = await fetch(
          apiUrl(`/api/bot/guild/${encodeURIComponent(HUB_GUILD_ID)}/summary`),
          { credentials: "include", signal: ac.signal },
        );
        if (!res.ok) {
          const summaryError = await readError(res);
          setGuildWidget((g) => ({
            ...g,
            summary: null,
            summaryError,
          }));
          return;
        }
        const summary = (await res.json()) as GuildSummaryResponse;
        setGuildWidget((g) => ({
          ...g,
          summary,
          summaryError: null,
        }));
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          return;
        }
        setGuildWidget((g) => ({
          ...g,
          summary: null,
          summaryError: "Nätverksfel vid hämtning av summary",
        }));
      }
    };

    const fetchLive = async () => {
      try {
        const res = await fetch(
          apiUrl(`/api/bot/live/guild/${encodeURIComponent(HUB_GUILD_ID)}`),
          { credentials: "include", signal: ac.signal },
        );
        if (!res.ok) {
          const liveError = await readError(res);
          setGuildWidget((g) => ({
            ...g,
            live: null,
            liveError,
          }));
          return;
        }
        const live = (await res.json()) as GuildLiveResponse;
        setGuildWidget((g) => ({ ...g, live, liveError: null }));
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          return;
        }
        setGuildWidget((g) => ({
          ...g,
          live: null,
          liveError: "Nätverksfel vid hämtning av live-data",
        }));
      }
    };

    void Promise.all([fetchSummary(), fetchLive()]);
    const tSummary = window.setInterval(() => void fetchSummary(), 15_000);
    const tLive = window.setInterval(() => void fetchLive(), 4_000);
    return () => {
      ac.abort();
      window.clearInterval(tSummary);
      window.clearInterval(tLive);
    };
  }, [me.status]);

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
              <code className="text-foreground">discord-hub-api</code> körs inte eller har avslutats
              (t.ex. saknade miljövariabler).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Kontrollera att API:t körs.</p>
            <p>
              Öppna terminalen där du kör dev-stacken och läs fliken{" "}
              <code className="text-foreground">[api]</code>. Lägg till värden från{" "}
              <code className="text-foreground">apps/discord-hub-api/.env.example</code> i repots{" "}
              <code className="text-foreground">.env</code>, starta om sedan{" "}
              <code className="text-foreground">clanker dev discord</code> eller{" "}
              <code className="text-foreground">npm run dev:discord-stack</code>.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { profile } = me;
  const displayName = profile.global_name ?? profile.username;
  const publicProfilePath = `/u/${encodeURIComponent(profile.id)}`;

  return (
    <div className="flex flex-col gap-6">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        <h1 className="text-3xl font-semibold tracking-tight">Discord hub</h1>
        <p className="mt-2 text-muted-foreground">Verktyg för discord-gänget — fler moduler kommer här.</p>
      </motion.header>

      {me.status === "user" && HUB_GUILD_ID ? (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Discord-server (bot)</CardTitle>
              <CardDescription>
                REST-summary och Gateway voice-state för guild{" "}
                <code className="text-foreground">{HUB_GUILD_ID}</code>. Kräver{" "}
                <code className="text-foreground">DISCORD_BOT_TOKEN</code> och rätt allowlist i API.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              {guildWidget.summaryError ? (
                <p className="text-destructive">Summary: {guildWidget.summaryError}</p>
              ) : null}
              {guildWidget.liveError ? (
                <p className="text-destructive">Live: {guildWidget.liveError}</p>
              ) : null}
              {guildWidget.summary ? (
                <div className="space-y-1">
                  <p className="text-foreground font-medium">{guildWidget.summary.guild.name}</p>
                  <p>
                    Medlemmar (ca): {guildWidget.summary.guild.approximate_member_count ?? "—"} · online (ca):{" "}
                    {guildWidget.summary.guild.approximate_presence_count ?? "—"} · kanaler:{" "}
                    {guildWidget.summary.channel_count}
                  </p>
                </div>
              ) : !guildWidget.summaryError ? (
                <p>Laddar summary…</p>
              ) : null}
              {guildWidget.live ? (
                <div className="space-y-1 border-border border-t pt-3">
                  <p>
                    Gateway:{" "}
                    {guildWidget.live.gateway_connected ? (
                      <span className="text-foreground">ansluten</span>
                    ) : (
                      <span className="text-destructive">frånkopplad</span>
                    )}
                    {guildWidget.live.gateway_degraded ? (
                      <span className="text-destructive">
                        {" "}
                        · degraded
                        {guildWidget.live.gateway_degraded_reason
                          ? `: ${guildWidget.live.gateway_degraded_reason}`
                          : ""}
                      </span>
                    ) : null}
                  </p>
                  <p>
                    I voice just nu: {guildWidget.live.voice_users.length}{" "}
                    {guildWidget.live.last_event_at ? `· senaste event: ${guildWidget.live.last_event_at}` : null}
                  </p>
                </div>
              ) : !guildWidget.liveError ? (
                <p>Laddar live…</p>
              ) : null}
            </CardContent>
          </Card>
        </section>
      ) : me.status === "user" && !HUB_GUILD_ID ? (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Discord-server (bot)</CardTitle>
              <CardDescription>
                Sätt <code className="text-foreground">VITE_DISCORD_HUB_GUILD_ID</code> i{" "}
                <code className="text-foreground">.env</code> (repots rot) för att visa server-widgeten här.
              </CardDescription>
            </CardHeader>
          </Card>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FontAwesomeIcon icon={faGamepad} /> Spin the Wheel
            </CardTitle>
            <CardDescription>Dela upp i lag och lotta fram vinnare.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>
              Gå till{" "}
              <Link
                to="/tools/spin-the-wheel"
                className="text-foreground underline-offset-4 hover:underline"
              >
                verktyget
              </Link>{" "}
              för att skapa randomiserade lag eller dra en spelare från en deltagarlista.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FontAwesomeIcon icon={faShieldHalved} /> Status
            </CardTitle>
            <CardDescription>Snabbstatus för kontot.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>Discord inloggning: Aktiv</p>
            <p>
              League och profil: öppna{" "}
              <Link
                to={publicProfilePath}
                className="text-foreground underline-offset-4 hover:underline"
              >
                din profil
              </Link>{" "}
              och välj Profilinställningar där.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FontAwesomeIcon icon={faGamepad} /> Spel
            </CardTitle>
            <CardDescription>Rank, synk och matchdata.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>
              Koppla Riot-konto och synka via Profilinställningar — samma väg:{" "}
              <Link
                to={publicProfilePath}
                className="text-foreground underline-offset-4 hover:underline"
              >
                din profil
              </Link>
              , sedan knappen Profilinställningar.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FontAwesomeIcon icon={faUserGear} /> Mer profildata
            </CardTitle>
            <CardDescription>Extra datafält för framtida moduler.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>Discord-ID: {profile.id}</p>
            <p>Visningsnamn: {displayName}</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
