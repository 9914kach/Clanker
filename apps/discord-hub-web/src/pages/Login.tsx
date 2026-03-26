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
import { useHubLocale } from "@/components/locale-provider";
import { apiUrl } from "@/config";

export default function LoginPage() {
  const { copy } = useHubLocale();
  const L = copy.login;
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
            <CardTitle>{L.title}</CardTitle>
            <CardDescription>{L.description}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {oauthError ? (
              <p className="text-sm text-destructive" role="alert">
                {L.oauthFailed}
              </p>
            ) : null}
            {apiUnreachable ? (
              <p className="text-sm text-muted-foreground" role="status">
                {L.apiUnreachable}
              </p>
            ) : null}
            {apiUnreachable ? (
              <Button type="button" className="w-full" disabled>
                {L.continueDisabled}
              </Button>
            ) : (
              <Button asChild className="w-full">
                <a href={apiUrl("/api/auth/discord")}>{L.continueDiscord}</a>
              </Button>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
