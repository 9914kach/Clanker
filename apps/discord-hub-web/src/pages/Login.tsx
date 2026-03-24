import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@clanker/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@clanker/ui/components/card";
import { apiUrl } from "@/config";

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const oauthError = searchParams.get("error") === "oauth";
  const [apiUnreachable, setApiUnreachable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl("/api/auth/me"), {
          credentials: "include",
        });
        if (cancelled) {
          return;
        }
        if (res.ok) {
          navigate("/dashboard", { replace: true });
          return;
        }
        if (res.status === 401) {
          return;
        }
        setApiUnreachable(true);
      } catch {
        if (!cancelled) {
          setApiUnreachable(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-5 py-10">
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Logga in</CardTitle>
            <CardDescription>
              Synka med Discord för att använda hubben.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {oauthError ? (
              <p className="text-sm text-destructive" role="alert">
                Inloggningen misslyckades. Försök igen.
              </p>
            ) : null}
            {apiUnreachable ? (
              <p className="text-sm text-muted-foreground" role="status">
                Backend svarar inte (port 3001). Vanlig orsak:{" "}
                <code className="text-foreground">discord-hub-api</code> har
                kraschat vid start — kontrollera terminalen{" "}
                <code className="text-foreground">[api]</code> och att repots{" "}
                <code className="text-foreground">.env</code> innehåller variablerna
                i{" "}
                <code className="text-foreground">
                  apps/discord-hub-api/.env.example
                </code>{" "}
                (t.ex. <code className="text-foreground">DISCORD_CLIENT_ID</code>
                ).
              </p>
            ) : null}
            {apiUnreachable ? (
              <Button type="button" className="w-full" disabled>
                Fortsätt med Discord
              </Button>
            ) : (
              <Button asChild className="w-full">
                <a href={apiUrl("/api/auth/discord")}>Fortsätt med Discord</a>
              </Button>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
