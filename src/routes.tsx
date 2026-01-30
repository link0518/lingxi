import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./ui/AppShell";
import { CharactersPage } from "./views/CharactersPage";
import { ChatPage } from "./views/ChatPage";
import { CharacterEditorPage } from "./views/CharacterEditorPage";
import { LoginPage } from "./views/LoginPage";
import { RegisterPage } from "./views/RegisterPage";
import { SettingsPage } from "./views/SettingsPage";
import { PromptPresetsPage } from "./views/PromptPresetsPage";
import { PromptPresetEditorPage } from "./views/PromptPresetEditorPage";
import { ApiSettingsPage } from "./views/ApiSettingsPage";
import { MessagesPage } from "./views/MessagesPage";
import { ContactsPage } from "./views/ContactsPage";
import { MomentsPage } from "./views/MomentsPage";
import { MePage } from "./views/MePage";
import { RequireAuth } from "./routes/RequireAuth";
import { RequireAdmin } from "./routes/RequireAdmin";
import { AdminPage } from "./views/AdminPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/moments" element={<MomentsPage />} />
        <Route path="/me" element={<MePage />} />
        <Route path="/characters" element={<CharactersPage />} />
        <Route path="/characters/:id/edit" element={<CharacterEditorPage />} />
        <Route path="/characters/import" element={<CharacterEditorPage />} />
        <Route path="/chat/:sessionId" element={<ChatPage />} />
        <Route path="/settings" element={<SettingsPage />}>
          <Route path="presets" element={<PromptPresetsPage />} />
          <Route path="presets/:id" element={<PromptPresetEditorPage />} />
          <Route path="api" element={<ApiSettingsPage />} />
        </Route>
        <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
      </Route>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
