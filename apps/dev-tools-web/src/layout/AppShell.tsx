import { motion } from "framer-motion";
import { Outlet } from "react-router-dom";
import { TopNav } from "@/components/TopNav";

export function AppShell() {
  return (
    <div className="app-shell">
      <TopNav />
      <motion.div
        className="app-main"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        <Outlet />
      </motion.div>
    </div>
  );
}
