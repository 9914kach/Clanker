import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import HomePage from "@/pages/Home";
import LoginPage from "@/pages/Login";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
