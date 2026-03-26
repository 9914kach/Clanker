import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@clanker/ui/components/tooltip";
import { HubAudioProvider } from "@/components/HubAudioProvider";
import { HubToastProvider } from "@/components/HubToastProvider";
import { ThemeProvider } from "@/components/theme-provider";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="discord-hub-ui-theme">
      <TooltipProvider>
        <HubAudioProvider>
          <HubToastProvider>
            <App />
          </HubToastProvider>
        </HubAudioProvider>
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
);
