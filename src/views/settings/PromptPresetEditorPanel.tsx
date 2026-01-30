import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  apiDeletePromptPreset,
  apiGetPromptPreset,
  apiUpdatePromptPreset,
  loadApiConfig,
  type PromptBricksConfig,
} from "../../lib/api";

export function PromptPresetEditorPanel(props: { onBack?: () => void }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const cfg = useMemo(() => loadApiConfig(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [bricks, setBricks] = useState<PromptBricksConfig | null>(null);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!cfg || !id) return;
    (async () => {
      setError(null);
      try {
        const data = await apiGetPromptPreset(cfg, id);
        const maybe = data as { error?: unknown };
        if (maybe?.error) throw new Error(String(maybe.error));
        setName(data.name);
        setBricks(data.bricks);
        setIsActive(Boolean(data.isActive));
      } catch (e: unknown) {
        const err = e as { message?: unknown };
        setError(String(err?.message ?? e));
      }
    })();
  }, [cfg, id]);

  async function save(applyNow: boolean) {
    if (!cfg || !id || !bricks) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await apiUpdatePromptPreset(cfg, id, { name: name.trim() || "未命名预设", bricks, applyNow });
      setSaved(applyNow ? "已保存并设为当前" : "已保存");
      window.setTimeout(() => setSaved((p) => (p ? null : p)), 1200);
      if (applyNow) setIsActive(true);
    } catch (e: unknown) {
      const err = e as { message?: unknown };
      setError(String(err?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 max-w-[920px]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-lg font-semibold text-text truncate">编辑预设</div>
          <div className="mt-1 text-sm text-muted">修改后可选择“仅保存”或“保存并应用为当前”。</div>
        </div>
        <button
          type="button"
          className="ui-btn-ghost h-10 px-4 text-sm shrink-0"
          onClick={() => {
            if (props.onBack) props.onBack();
            else if (window.history.length > 1) navigate(-1);
            else navigate("/settings/presets");
          }}
        >
          返回
        </button>
      </div>

      {error ? <div className="mt-4 ui-card-subtle p-4 text-sm text-red-600">{error}</div> : null}
      {saved ? <div className="mt-4 ui-card-subtle p-4 text-sm text-cta">{saved}</div> : null}

      <div className="mt-6 ui-card p-6 space-y-4">
        <label className="block space-y-2">
          <span className="text-sm text-muted">预设名称</span>
          <input className="ui-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：纯对话（默认）" />
        </label>

        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted">
            状态：{isActive ? <span className="text-cta">当前预设</span> : <span>非当前</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="ui-btn-ghost h-10 px-4 text-sm"
              disabled={!cfg || busy || !id}
              onClick={async () => {
                if (!cfg || !id) return;
                if (!window.confirm("确定删除该预设？")) return;
                setBusy(true);
                setError(null);
                try {
                  await apiDeletePromptPreset(cfg, id);
                  if (props.onBack) props.onBack();
                  else if (window.history.length > 1) navigate(-1);
                  else navigate("/settings/presets");
                } catch (e: unknown) {
                  const err = e as { message?: unknown };
                  setError(String(err?.message ?? e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              删除
            </button>
            <button className="ui-btn-ghost h-10 px-4 text-sm" disabled={!cfg || busy || !bricks} onClick={() => void save(false)}>
              {busy ? "保存中…" : "仅保存"}
            </button>
            <button className="ui-btn-primary h-10 px-4 text-sm" disabled={!cfg || busy || !bricks} onClick={() => void save(true)}>
              {busy ? "保存中…" : "保存并应用"}
            </button>
          </div>
        </div>
      </div>

      {!bricks ? (
        <div className="mt-6 ui-card-subtle p-4 text-sm text-muted">加载中…</div>
      ) : (
        <div className="mt-6 space-y-4">
          {bricks.bricks.map((b, idx) => (
            <div key={b.id} className="ui-card-subtle p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{b.title}</div>
                  <div className="text-xs text-muted">{b.id}</div>
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={b.enabled}
                    onChange={(e) =>
                      setBricks((prev) =>
                        !prev
                          ? prev
                          : { ...prev, bricks: prev.bricks.map((x, i) => (i === idx ? { ...x, enabled: e.target.checked } : x)) },
                      )
                    }
                  />
                  启用
                </label>
              </div>
              <textarea
                className="mt-3 ui-input min-h-[160px] resize-y font-mono text-xs leading-5"
                value={b.content}
                onChange={(e) =>
                  setBricks((prev) =>
                    !prev ? prev : { ...prev, bricks: prev.bricks.map((x, i) => (i === idx ? { ...x, content: e.target.value } : x)) },
                  )
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
