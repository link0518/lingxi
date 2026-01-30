import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiActivatePromptPreset, apiCreatePromptPreset, apiGetSettings, apiListPromptPresets, loadApiConfig } from "../lib/api";
import { StitchIcon } from "../ui/stitch/StitchIcon";
import { WxTitleBar } from "../ui/WxTitleBar";

export function PromptPresetsPage() {
  const navigate = useNavigate();
  const cfg = useMemo(() => loadApiConfig(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presets, setPresets] = useState<Array<{ id: string; name: string; isActive: boolean; updatedAt: string }>>([]);

  const refresh = useCallback(async () => {
    if (!cfg) return;
    const data = await apiListPromptPresets(cfg);
    setPresets(data.presets);
  }, [cfg]);

  useEffect(() => {
    void refresh();
  }, [cfg, refresh]);

  async function createFromCurrent() {
    if (!cfg) return;
    setBusy(true);
    setError(null);
    try {
      const s = await apiGetSettings(cfg);
      const name = window.prompt("预设名称", `我的预设 ${new Date().toLocaleString()}`) ?? "";
      if (!name.trim()) return;
      const res = await apiCreatePromptPreset(cfg, { name: name.trim(), bricks: s.promptBricks, setActive: true });
      await refresh();
      navigate(`/settings/presets/${res.id}`);
    } catch (e: unknown) {
      const err = e as { message?: unknown };
      setError(String(err?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ui-page">
      <WxTitleBar title="提示词预设" backTo="/settings" />

      <main className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-4">
        {!cfg ? (
          <div className="ui-card-subtle p-4 text-sm text-muted">
            未检测到 API 配置，请先到 <Link className="underline" to="/login">登录页</Link> 填写后端地址与 Token。
          </div>
        ) : null}

        <div className="mt-4 flex items-center gap-3">
          <button className="ui-btn-primary h-11 px-4 text-sm" disabled={!cfg || busy} onClick={() => void createFromCurrent()}>
            {busy ? "创建中…" : "从当前配置创建预设"}
          </button>
        </div>

        {error ? <div className="mt-4 ui-card-subtle p-4 text-sm text-red-600">{error}</div> : null}

        <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
          {presets.length === 0 ? <div className="px-4 py-4 text-sm text-muted">暂无预设。</div> : null}
          {presets.map((p) => (
            <button
              key={p.id}
              className="w-full text-left flex items-center justify-between gap-4 px-4 py-3.5 border-b border-line/60 last:border-b-0 hover:bg-surface-2/40 active:bg-surface-2/70 transition-colors"
              onClick={() => navigate(`/settings/presets/${p.id}`)}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-[15px] font-medium truncate">{p.name}</div>
                  {p.isActive ? <span className="text-xs rounded-control border border-line bg-cta/10 px-2 py-0.5 text-cta">当前</span> : null}
                </div>
                <div className="text-xs text-muted">更新：{new Date(p.updatedAt).toLocaleString()}</div>
              </div>

              <div className="shrink-0 text-muted flex items-center gap-2">
                {!p.isActive ? (
                  <button
                    className="ui-btn-primary h-9 px-3 text-sm"
                    disabled={!cfg || busy}
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!cfg) return;
                      setBusy(true);
                      setError(null);
                      try {
                        await apiActivatePromptPreset(cfg, p.id);
                        await refresh();
                      } catch (err: unknown) {
                        const e = err as { message?: unknown };
                        setError(String(e?.message ?? err));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    设为当前
                  </button>
                ) : null}
                <span className="inline-flex">
                  <StitchIcon name="chevron_right" />
                </span>
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}

