import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HubToastProvider } from "@/components/HubToastProvider";
import { ThemeProvider } from "@/components/theme-provider";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="discord-hub-ui-theme">
      <HubToastProvider>
        <App />
      </HubToastProvider>
    </ThemeProvider>
  </StrictMode>,
);
