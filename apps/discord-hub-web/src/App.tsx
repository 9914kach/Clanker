import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import HubLayout from "@/components/HubLayout";
import DashboardPage from "@/pages/Dashboard";
import HomePage from "@/pages/Home";
import LoginPage from "@/pages/Login";
import ProfileSettingsPage from "@/pages/ProfileSettings";
import PublicProfilePage from "@/pages/PublicProfile";
import SpinTheWheelPage from "@/pages/SpinTheWheel";
import MusicPlayerPage from "@/pages/MusicPlayer";
import LeagueStatsPage from "@/pages/LeagueStats";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<HubLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/profile/settings" element={<ProfileSettingsPage />} />
          <Route path="/tools/spin-the-wheel" element={<SpinTheWheelPage />} />
          <Route path="/tools/music" element={<MusicPlayerPage />} />
          <Route path="/tools/league-stats" element={<LeagueStatsPage />} />
          <Route path="/u/:userId" element={<PublicProfilePage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
