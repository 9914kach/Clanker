import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
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

type MeState =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "user"; username: string }
  | { status: "backend_error" };

export default function HomePage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<MeState>({ status: "loading" });

  const refreshMe = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/auth/me"), {
        credentials: "include",
      });
      if (res.ok) {
        const data = (await res.json()) as { username: string };
        setMe({ status: "user", username: data.username });
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

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <motion.header
        className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Discord hub</h1>
          <p className="mt-2 text-muted-foreground">
            Verktyg för discord-gänget — fler moduler kommer här.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Inloggad som{" "}
            <span className="font-medium text-foreground">{me.username}</span>
          </span>
          <Button type="button" variant="outline" size="sm" onClick={logout}>
            Logga ut
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
