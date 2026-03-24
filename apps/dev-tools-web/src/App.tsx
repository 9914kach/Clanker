import { BrowserRouter, Route, Routes } from "react-router-dom";
import { DocsViewer } from "@/components/DocsViewer";
import { Home } from "@/pages/Home";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/docs/*" element={<DocsViewer />} />
      </Routes>
    </BrowserRouter>
  );
}
