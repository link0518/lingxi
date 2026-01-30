import { useEffect, useMemo, useState } from "react";
import { apiUpdateSettingsLlm, loadApiConfig, saveApiConfig, type ApiConfig } from "../lib/api";
import { StitchIcon } from "../ui/stitch/StitchIcon";
import { WxTitleBar } from "../ui/WxTitleBar";

type ModelItem = { id: string };

async function fetchModels(llmBaseUrl: string, llmApiKey: string): Promise<ModelItem[]> {
  const base = llmBaseUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/v1/models`, {
    method: "GET",
    headers: { Authorization: `Bearer ${llmApiKey}` },
  });
  if (!res.ok) throw new Error(`模型列表获取失败：HTTP ${res.status}`);
  const raw = await res.text();
  let data: { data?: Array<{ id?: unknown }> } | null = null;
  try {
    data = JSON.parse(raw) as { data?: Array<{ id?: unknown }> };
  } catch {
    throw new Error("模型列表响应不是 JSON，请检查 Base URL 或网关是否兼容 /v1/models");
  }
  const list = (data?.data ?? []).map((x) => ({ id: String(x.id ?? "") })).filter((x) => x.id);
  return list;
}

export function ApiSettingsPage() {
  const existing = useMemo(() => loadApiConfig(), []);
  const [cfg, setCfg] = useState<ApiConfig | null>(existing);

  const [llmBaseUrl, setLlmBaseUrl] = useState(existing?.llmBaseUrl ?? existing?.baseUrl ?? "");
  const [llmApiKey, setLlmApiKey] = useState(existing?.llmApiKey ?? "");
  const [llmModelChat, setLlmModelChat] = useState(existing?.llmModelChat ?? "");
  const [llmModelLight, setLlmModelLight] = useState(existing?.llmModelLight ?? "");

  const [models, setModels] = useState<ModelItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    setCfg(existing);
  }, [existing]);

  async function refreshModels() {
    setError(null);
    setBusy(true);
    try {
      if (!llmBaseUrl.trim()) throw new Error("请填写 LLM Base URL");
      if (!llmApiKey.trim()) throw new Error("请填写 LLM API Key");
      const list = await fetchModels(llmBaseUrl.trim(), llmApiKey.trim());
      setModels(list);
      if (!llmModelChat && list[0]?.id) setLlmModelChat(list[0].id);
      if (!llmModelLight && list[0]?.id) setLlmModelLight(list[0].id);
      setOk("已刷新模型列表");
      window.setTimeout(() => setOk(null), 1200);
    } catch (e: unknown) {
      const err = e as { message?: unknown };
      setError(String(err?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  function save() {
    setError(null);
    if (!cfg) {
      setError("尚未登录：请先登录。");
      return;
    }
    const next: ApiConfig = {
      ...cfg,
      llmBaseUrl: llmBaseUrl.trim() || undefined,
      llmApiKey: llmApiKey.trim() || undefined,
      llmModelChat: llmModelChat.trim() || undefined,
      llmModelLight: llmModelLight.trim() || undefined,
    };
    saveApiConfig(next);
    void apiUpdateSettingsLlm(cfg, {
      baseUrl: next.llmBaseUrl || "",
      apiKey: next.llmApiKey || "",
      modelChat: next.llmModelChat || "",
      modelLight: next.llmModelLight || "",
    }).catch(() => {});
    setOk("已保存");
    window.setTimeout(() => setOk(null), 1200);
  }

  return (
    <div className="ui-page">
      <WxTitleBar
        title="API 设置"
        backTo="/settings"
        right={
          <button type="button" className="ui-btn-primary h-9 px-3 text-sm" onClick={save}>
            保存
          </button>
        }
      />

      <main className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-4">
        <div className="ui-card p-5 space-y-4">
          <div className="text-sm text-muted">配置 LLM 网关与模型（聊天模型/轻量任务模型）。</div>

          <label className="block space-y-2">
            <div className="text-sm text-muted">LLM Base URL（OpenAI 兼容）</div>
            <input className="ui-input" value={llmBaseUrl} onChange={(e) => setLlmBaseUrl(e.target.value)} placeholder="http://localhost:8000" />
          </label>

          <label className="block space-y-2">
            <div className="text-sm text-muted">LLM API Key</div>
            <input className="ui-input" value={llmApiKey} onChange={(e) => setLlmApiKey(e.target.value)} placeholder="sk-..." />
          </label>

          <div className="flex items-center gap-2">
            <button className="ui-btn-ghost h-10 px-4 text-sm" disabled={busy} onClick={() => void refreshModels()}>
              {busy ? "刷新中…" : "自动获取模型"}
            </button>
            <div className="text-xs text-muted inline-flex items-center gap-1">
              <StitchIcon name="info" />
              需要网关支持 `GET /v1/models`
            </div>
          </div>

          <label className="block space-y-2">
            <div className="text-sm text-muted">聊天模型</div>
            <select className="ui-input h-11" value={llmModelChat} onChange={(e) => setLlmModelChat(e.target.value)}>
              <option value="">（未选择）</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <div className="text-sm text-muted">轻量任务模型（好感/记忆等）</div>
            <select className="ui-input h-11" value={llmModelLight} onChange={(e) => setLlmModelLight(e.target.value)}>
              <option value="">（未选择）</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                </option>
              ))}
            </select>
          </label>

          {error ? <div className="ui-card-subtle p-3 text-sm text-red-600">{error}</div> : null}
          {ok ? <div className="ui-card-subtle p-3 text-sm text-cta">{ok}</div> : null}
        </div>
      </main>
    </div>
  );
}

