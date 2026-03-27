import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@clanker/ui/components/tooltip";
import { HubAudioProvider } from "@/components/HubAudioProvider";
import { HubPrefsProvider } from "@/components/HubPrefsProvider";
import { HubToastProvider } from "@/components/HubToastProvider";
import { LocaleProvider } from "@/components/locale-provider";
import { ThemeProvider } from "@/components/theme-provider";
import "gridstack/dist/gridstack.min.css";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="discord-hub-ui-theme">
      <LocaleProvider defaultLocale="sv">
        <HubPrefsProvider>
          <TooltipProvider>
            <HubAudioProvider>
              <HubToastProvider>
                <App />
              </HubToastProvider>
            </HubAudioProvider>
          </TooltipProvider>
        </HubPrefsProvider>
      </LocaleProvider>
    </ThemeProvider>
  </StrictMode>,
);
