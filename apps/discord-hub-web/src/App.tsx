import { motion } from "framer-motion";
import { Button } from "@clanker/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@clanker/ui/components/card";

function App() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
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
                <code>apps/discord-hub-api</code> (kommer).
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

export default App;
