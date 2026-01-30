export function buildMessages({ system, history, userMessage }) {
  const msgs = [];
  if (system) msgs.push({ role: "system", content: system });
  for (const h of history || []) {
    msgs.push({ role: h.role, content: h.content });
  }
  if (userMessage) msgs.push({ role: "user", content: userMessage });
  return msgs;
}

export function pickModel(cfg) {
  const chat = cfg?.llmModelChat || "";
  const light = cfg?.llmModelLight || "";
  return { chat: chat || light || "", light: light || chat || "" };
}

export async function callOpenAICompatible({ baseUrl, apiKey, model, messages, stream }) {
  if (!baseUrl || !apiKey || !model) {
    throw new Error("LLM 配置缺失：请在设置中填写 Base URL / API Key / Model");
  }
  const url = `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: Boolean(stream),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM 请求失败：HTTP ${res.status} ${text || ""}`.trim());
  }
  return res;
}
