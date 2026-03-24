import { faArrowRightFromBracket } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { motion } from "framer-motion";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
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

export default function DashboardPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<MeState>({ status: "loading" });

  const refreshMe = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/auth/me"), {
        credentials: "include",
      });
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

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const logout = async () => {
    await fetch(apiUrl("/api/auth/logout"), {
      method: "POST",
      credentials: "include",
    });
    navigate("/login", { replace: true });
  };

  if (me.status === "loading") {
    return (
      <div className="mx-auto max-w-3xl px-5 py-10 text-muted-foreground">
        Laddar…
      </div>
    );
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
              <code className="text-foreground">discord-hub-api</code> körs inte
              eller har avslutats (t.ex. saknade miljövariabler).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Öppna terminalen där du kör dev-stacken och läs fliken{" "}
              <code className="text-foreground">[api]</code>. Lägg till värden
              från{" "}
              <code className="text-foreground">
                apps/discord-hub-api/.env.example
              </code>{" "}
              i repots <code className="text-foreground">.env</code>, starta om
              sedan <code className="text-foreground">clanker dev discord</code>{" "}
              eller <code className="text-foreground">npm run dev:discord-stack</code>
              .
            </p>
          </CardContent>
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
    <div className="mx-auto max-w-3xl px-5 py-10">
      <section className="relative mb-10">
        <div className="relative min-h-[118px] overflow-hidden rounded-xl border border-border shadow-sm sm:min-h-[132px]">
          <div
            className={`absolute inset-0 ${
              profile.banner || profile.accent_color !== null ? "" : "bg-muted"
            }`}
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
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/15 via-black/25 to-black/65 dark:from-black/25 dark:via-black/35 dark:to-black/80"
            aria-hidden
          />

          <motion.div
            className="relative z-10 flex min-h-[118px] flex-col justify-end gap-2 px-4 pb-3 pt-5 sm:min-h-[132px] sm:flex-row sm:items-end sm:justify-between sm:gap-3 sm:px-6 sm:pb-4 sm:pt-6"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut", delay: 0.05 }}
          >
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <img
                src={discordAvatarUrl(profile.id, profile.avatar, 128)}
                alt={displayName}
                width={112}
                height={112}
                className="size-24 shrink-0 rounded-full object-cover shadow-lg ring-4 ring-white/35 sm:size-28"
                decoding="async"
              />
              <div className="min-w-0 flex-1 pb-0.5">
                <p className="truncate text-2xl font-semibold leading-none tracking-tight text-white drop-shadow-sm">
                  {displayName}
                </p>
                {profile.global_name ? (
                  <p className="mt-1 truncate font-mono text-sm text-white/80 drop-shadow-sm">
                    @{profile.username}
                  </p>
                ) : null}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-white hover:bg-white/15 hover:text-white focus-visible:ring-white/50 sm:self-end"
              aria-label="Logga ut"
              onClick={logout}
            >
              <FontAwesomeIcon icon={faArrowRightFromBracket} />
            </Button>
          </motion.div>
        </div>
      </section>

      <motion.header
        className="mb-8"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        <h1 className="text-3xl font-semibold tracking-tight">Discord hub</h1>
        <p className="mt-2 text-muted-foreground">
          Verktyg för discord-gänget — fler moduler kommer här.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex max-w-md min-w-0 flex-1 flex-col gap-2">
            <p className="text-muted-foreground text-sm">
              Diagramfärger (chart-1–5) och primärknapp följer valt färgtema i
              temamenyn.
            </p>
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
          </div>
          <Button type="button" className="shrink-0">
            Primärfärg (exempel)
          </Button>
        </div>
      </motion.header>
      <main>
        <Card>
          <CardHeader>
            <CardTitle>Nästa steg</CardTitle>
            <CardDescription>
              Bygg vidare med samma stack som dev-tools-web.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
              <li>
                Lägg verktyg under <code>src/tools/</code> med egna routes.
              </li>
              <li>
                Backend + DB: profil <code>db</code> i rot{" "}
                <code>docker-compose.yml</code>, API i{" "}
                <code>apps/discord-hub-api</code>.
              </li>
            </ul>
            <div className="mt-6">
              <Button type="button" variant="secondary" size="sm" disabled>
                Fler actions snart
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
