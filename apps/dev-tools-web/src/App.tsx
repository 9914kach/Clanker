import { BrowserRouter, Route, Routes } from "react-router-dom";
import { DocsViewer } from "@/components/DocsViewer";
import { AppShell } from "@/layout/AppShell";
import { Home } from "@/pages/Home";
import { ChecklistsPage } from "@/tools/ChecklistsPage";
import { HomelabTodoPage } from "@/tools/HomelabTodoPage";
import { HttpPlaygroundPage } from "@/tools/HttpPlaygroundPage";
import { LinksPage } from "@/tools/LinksPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<Home />} />
          <Route path="docs/*" element={<DocsViewer />} />
          <Route path="tools/checklists" element={<ChecklistsPage />} />
          <Route path="tools/links" element={<LinksPage />} />
          <Route path="tools/http" element={<HttpPlaygroundPage />} />
          <Route path="tools/todo" element={<HomelabTodoPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
