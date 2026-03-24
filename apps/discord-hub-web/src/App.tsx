import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ModeToggle } from "@/components/mode-toggle";
import DashboardPage from "@/pages/Dashboard";
import HomePage from "@/pages/Home";
import LoginPage from "@/pages/Login";

export default function App() {
  return (
    <>
      <div className="fixed right-4 bottom-4 z-50">
        <ModeToggle />
      </div>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/" element={<HomePage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}
