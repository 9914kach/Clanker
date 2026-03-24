import { Outlet } from "react-router-dom";
import { TopNav } from "@/components/TopNav";

export function AppShell() {
  return (
    <div className="app-shell">
      <TopNav />
      <div className="app-main">
        <Outlet />
      </div>
    </div>
  );
}
