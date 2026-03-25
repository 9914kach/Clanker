import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import HubLayout from "@/components/HubLayout";
import DashboardPage from "@/pages/Dashboard";
import HomePage from "@/pages/Home";
import LoginPage from "@/pages/Login";
import ProfileSettingsPage from "@/pages/ProfileSettings";
import PublicProfilePage from "@/pages/PublicProfile";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<HomePage />} />
        <Route element={<HubLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/profile/settings" element={<ProfileSettingsPage />} />
          <Route path="/u/:userId" element={<PublicProfilePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
