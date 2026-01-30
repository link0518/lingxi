import { useNavigate } from "react-router-dom";
import { PromptPresetEditorPanel } from "./settings/PromptPresetEditorPanel";

export function PromptPresetEditorPage() {
  const navigate = useNavigate();
  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-bg">
      <PromptPresetEditorPanel
        onBack={() => {
          if (window.history.length > 1) navigate(-1);
          else navigate("/settings/presets");
        }}
      />
    </div>
  );
}
