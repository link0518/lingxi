
export type ApiConfig = {
  baseUrl: string;
  authToken: string;
  userId: string;
  role?: "user" | "admin";
  llmBaseUrl?: string;
  llmApiKey?: string;
  llmModelChat?: string;
  llmModelLight?: string;
};

const LS_KEY = "lingxi_api_config_v1";

export function loadApiConfig(): ApiConfig | null {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ApiConfig>;
    if (typeof parsed.baseUrl !== "string" || !parsed.authToken || !parsed.userId) return null;
    return {
      baseUrl: String(parsed.baseUrl),
      authToken: String(parsed.authToken),
      userId: String(parsed.userId),
      role: parsed.role === "admin" ? "admin" : parsed.role === "user" ? "user" : undefined,
      llmBaseUrl: parsed.llmBaseUrl ? String(parsed.llmBaseUrl) : undefined,
      llmApiKey: parsed.llmApiKey ? String(parsed.llmApiKey) : undefined,
      llmModelChat: parsed.llmModelChat ? String(parsed.llmModelChat) : undefined,
      llmModelLight: parsed.llmModelLight ? String(parsed.llmModelLight) : undefined,
    };
  } catch {
    return null;
  }
}

export function isLoggedIn() {
  return Boolean(loadApiConfig());
}

export type RegisterPayload = { baseUrl: string; username: string; password: string; inviteCode: string };
export async function apiRegister(payload: RegisterPayload) {
  const res = await fetch(apiUrl(payload.baseUrl, "/api/auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: payload.username,
      password: payload.password,
      inviteCode: payload.inviteCode,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as { ok: boolean; token?: string; userId?: string; error?: string; role?: "user" | "admin" };
}

export type LoginPayload = { baseUrl: string; username: string; password: string };
export async function apiLogin(payload: LoginPayload) {
  const res = await fetch(apiUrl(payload.baseUrl, "/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: payload.username, password: payload.password }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as { ok: boolean; token?: string; userId?: string; role?: "user" | "admin"; error?: string };
}

export async function apiLogout(cfg: ApiConfig) {
  await apiFetch(cfg, "/api/auth/logout", { method: "POST" });
}

export async function apiGetAuthMe(cfg: ApiConfig) {
  const res = await apiFetch(cfg, "/api/auth/me", { method: "GET" });
  return (await res.json()) as { ok: boolean; userId: string; role: "user" | "admin"; username: string };
}

export async function apiChangePassword(cfg: ApiConfig, payload: { oldPassword: string; newPassword: string }) {
  const res = await apiFetch(cfg, "/api/auth/change-password", { method: "POST", body: JSON.stringify(payload) });
  return (await res.json()) as { ok: boolean; error?: string };
}

export async function apiAdminCreateInviteCodes(cfg: ApiConfig, payload?: { count?: number }) {
  const res = await apiFetch(cfg, "/api/admin/invite-codes", { method: "POST", body: JSON.stringify({ count: payload?.count ?? 1 }) });
  return (await res.json()) as { ok: boolean; codes: string[]; createdAt?: string };
}

export async function apiAdminListInviteCodes(cfg: ApiConfig) {
  const res = await apiFetch(cfg, "/api/admin/invite-codes", { method: "GET" });
  return (await res.json()) as { ok: boolean; codes: Array<{ code: string; createdAt: string; usedAt: string | null }> };
}

export async function apiAdminListUsers(cfg: ApiConfig) {
  const res = await apiFetch(cfg, "/api/admin/users", { method: "GET" });
  return (await res.json()) as { ok: boolean; users: Array<{ accountId: string; userId: string; username: string; role: "user" | "admin"; createdAt: string }> };
}

export async function apiAdminListUserSessions(cfg: ApiConfig, userId: string) {
  const res = await apiFetch(cfg, `/api/admin/users/${encodeURIComponent(userId)}/sessions`, { method: "GET" });
  return (await res.json()) as { ok: boolean; sessions: Array<{ id: string; userId: string; characterId: string; characterName: string; createdAt: string }> };
}

export async function apiAdminGetSessionMessages(cfg: ApiConfig, sessionId: string) {
  const res = await apiFetch(cfg, `/api/admin/sessions/${encodeURIComponent(sessionId)}/messages`, { method: "GET" });
  return (await res.json()) as { ok: boolean; messages: Array<{ id: string; role: "user" | "assistant"; content: string; createdAt: string }> };
}

export async function apiAdminSetUserPassword(cfg: ApiConfig, accountId: string, payload: { newPassword: string }) {
  const res = await apiFetch(cfg, `/api/admin/users/${encodeURIComponent(accountId)}/password`, { method: "POST", body: JSON.stringify(payload) });
  return (await res.json()) as { ok: boolean; error?: string };
}

export async function apiSyncMeta(cfg: ApiConfig) {
  const res = await apiFetch(cfg, `/api/sync/meta?userId=${encodeURIComponent(cfg.userId)}`, { method: "GET" });
  return (await res.json()) as {
    charactersUpdatedAt: string | null;
    sessionsUpdatedAt: string | null;
    messagesUpdatedAtBySession: Record<string, string | null>;
  };
}

export function loadApiConfigOrThrow(): ApiConfig {
  const cfg = loadApiConfig();
  if (!cfg) {
    throw new Error("尚未登录：请先前往“登录页”完成登录");
  }
  return cfg;
}

export function saveApiConfig(cfg: ApiConfig) {
  localStorage.setItem(LS_KEY, JSON.stringify(cfg));
}

export function clearApiConfig() {
  localStorage.removeItem(LS_KEY);
}

function apiUrl(baseUrl: string, path: string) {
  const trimmed = (baseUrl ?? "").trim();
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!trimmed) return p;
  if (trimmed === "/") return p;
  if (trimmed.toLowerCase() === "same-origin") return p;
  const base = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
  return `${base}${p}`;
}

export function assetUrl(baseUrl: string, url: string) {
  const u = (url ?? "").trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("data:")) return u;
  return apiUrl(baseUrl, u);
}

export type PromptBrickId =
  | "core.identity"
  | "core.style"
  | "core.pacing"
  | "core.proactive"
  | "core.memory_rules"
  | "safety.standard"
  | "custom.override"
  | "nsfw.placeholder";

export type PromptBrick = {
  id: PromptBrickId;
  title: string;
  enabled: boolean;
  content: string;
};

export type PromptBricksConfig = {
  version: 1;
  bricks: PromptBrick[];
};

export async function apiGetSettings(cfg: ApiConfig) {
  const res = await apiFetch(cfg, `/api/settings?userId=${encodeURIComponent(cfg.userId)}`, { method: "GET" });
  return (await res.json()) as { promptBricks: PromptBricksConfig };
}

export async function apiUpdatePromptBricks(cfg: ApiConfig, promptBricks: PromptBricksConfig) {
  await apiFetch(cfg, "/api/settings/prompt-bricks", {
    method: "PUT",
    body: JSON.stringify({ userId: cfg.userId, promptBricks }),
  });
}

export async function apiResetPromptBricks(cfg: ApiConfig) {
  const res = await apiFetch(cfg, "/api/settings/prompt-bricks/reset", {
    method: "POST",
    body: JSON.stringify({ userId: cfg.userId }),
  });
  return (await res.json()) as { ok: boolean; promptBricks: PromptBricksConfig };
}

export type PromptPresetListItem = { id: string; name: string; isActive: boolean; updatedAt: string };

export async function apiListPromptPresets(cfg: ApiConfig) {
  const res = await apiFetch(cfg, `/api/prompt-presets?userId=${encodeURIComponent(cfg.userId)}`, { method: "GET" });
  return (await res.json()) as { presets: PromptPresetListItem[] };
}

export async function apiGetPromptPreset(cfg: ApiConfig, id: string) {
  const res = await apiFetch(cfg, `/api/prompt-presets/${encodeURIComponent(id)}?userId=${encodeURIComponent(cfg.userId)}`, { method: "GET" });
  return (await res.json()) as { id: string; name: string; bricks: PromptBricksConfig; isActive: boolean; error?: string };
}

export async function apiCreatePromptPreset(cfg: ApiConfig, payload: { name: string; bricks: PromptBricksConfig; setActive?: boolean }) {
  const res = await apiFetch(cfg, "/api/prompt-presets", {
    method: "POST",
    body: JSON.stringify({ userId: cfg.userId, name: payload.name, bricks: payload.bricks, setActive: Boolean(payload.setActive) }),
  });
  return (await res.json()) as { ok: boolean; id: string };
}

export async function apiUpdatePromptPreset(cfg: ApiConfig, id: string, payload: { name: string; bricks: PromptBricksConfig; applyNow?: boolean }) {
  await apiFetch(cfg, `/api/prompt-presets/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ userId: cfg.userId, name: payload.name, bricks: payload.bricks, applyNow: Boolean(payload.applyNow) }),
  });
}

export async function apiDeletePromptPreset(cfg: ApiConfig, id: string) {
  await apiFetch(cfg, `/api/prompt-presets/${encodeURIComponent(id)}`, {
    method: "DELETE",
    body: JSON.stringify({ userId: cfg.userId }),
  });
}

export async function apiActivatePromptPreset(cfg: ApiConfig, id: string) {
  await apiFetch(cfg, `/api/prompt-presets/${encodeURIComponent(id)}/activate`, {
    method: "POST",
    body: JSON.stringify({ userId: cfg.userId }),
  });
}

async function apiFetch(cfg: ApiConfig, path: string, init?: RequestInit) {
  let res: Response;
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${cfg.authToken}`,
    };
    const hasBody = init?.body !== undefined && init?.body !== null;
    const rawHeaders = init?.headers as unknown;
    const headerRecord = (rawHeaders && typeof rawHeaders === "object" ? (rawHeaders as Record<string, unknown>) : null) ?? null;
    const contentType = headerRecord?.["Content-Type"] ?? headerRecord?.["content-type"];
    if (hasBody && !contentType && !(init?.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    res = await fetch(apiUrl(cfg.baseUrl, path), {
      ...init,
      headers: {
        ...headers,
        ...(init?.headers ?? {}),
      },
    });
  } catch (err: unknown) {
    const e = err as { message?: unknown };
    throw new Error(`网络请求失败（可能是后端地址不可达或协议不匹配）：${String(e?.message ?? err)}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401) {
      throw new Error("鉴权失败（401）：Token 不正确或已失效。请到登录页重新填写 API_AUTH_TOKEN。");
    }
    if (res.status === 413) {
      throw new Error("上传内容过大（413）。");
    }
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return res;
}

export async function apiCreateUser(cfg: Omit<ApiConfig, "userId">) {
  let res: Response;
  try {
    res = await fetch(apiUrl(cfg.baseUrl, "/api/users"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
  } catch (err: unknown) {
    const e = err as { message?: unknown };
    throw new Error(`网络请求失败（可能是后端地址不可达或协议不匹配）：${String(e?.message ?? err)}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { userId: string };
  return data.userId;
}

export async function apiGetMe(cfg: ApiConfig) {
  const res = await apiFetch(cfg, `/api/users/me?userId=${encodeURIComponent(cfg.userId)}`);
  return (await res.json()) as { userId: string; displayName: string; avatarUrl: string; personaText: string };
}

export async function apiUpdateMe(
  cfg: ApiConfig,
  payload: { displayName?: string; avatarUrl?: string; personaText?: string },
) {
  await apiFetch(cfg, "/api/users/me", {
    method: "PUT",
    body: JSON.stringify({ userId: cfg.userId, ...payload }),
  });
}

export async function apiSeedCharacters(cfg: ApiConfig) {
  await apiFetch(cfg, "/api/characters/seed", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function apiListCharacters(cfg: ApiConfig) {
  const res = await apiFetch(cfg, "/api/characters");
  return (await res.json()) as {
    characters: Array<{ id: string; name: string; gender: "unknown" | "male" | "female" | "other"; avatarUrl: string; tagline: string; updatedAt?: string }>;
  };
}

export async function apiListCharactersSince(cfg: ApiConfig, since: string) {
  const res = await apiFetch(cfg, `/api/characters?since=${encodeURIComponent(since)}`);
  return (await res.json()) as {
    characters: Array<{ id: string; name: string; gender: "unknown" | "male" | "female" | "other"; avatarUrl: string; tagline: string; updatedAt?: string }>;
  };
}

export type CharacterCardV1 = {
  version: 1;
  name: string;
  relationship: string;
  background: string;
  traits: string[];
  speechHabits: string[];
  boundaries: string[];
  catchphrases: string[];
  style?: { sweetness?: "low" | "medium" | "high"; proactivity?: "low" | "medium" | "high"; messageDensity?: "short" | "balanced" | "verbose" };
};

export async function apiGetCharacter(cfg: ApiConfig, id: string) {
  const res = await apiFetch(cfg, `/api/characters/${encodeURIComponent(id)}`);
  return (await res.json()) as {
    id: string;
    name: string;
    gender?: "unknown" | "male" | "female" | "other";
    avatarUrl?: string;
    persona_background: string;
    persona_traits: string;
    persona_speech_habits: string;
    card: CharacterCardV1;
    error?: string;
  };
}

export async function apiUpdateCharacterMeta(
  cfg: ApiConfig,
  id: string,
  payload: { name?: string; gender?: "unknown" | "male" | "female" | "other"; avatarUrl?: string },
) {
  await apiFetch(cfg, `/api/characters/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function apiDeleteCharacter(cfg: ApiConfig, id: string) {
  await apiFetch(cfg, `/api/characters/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function apiUpdateCharacterCard(cfg: ApiConfig, id: string, card: CharacterCardV1) {
  await apiFetch(cfg, `/api/characters/${encodeURIComponent(id)}/card`, {
    method: "PUT",
    body: JSON.stringify(card),
  });
}

export async function apiImportCharacter(cfg: ApiConfig, card: CharacterCardV1) {
  const res = await apiFetch(cfg, "/api/characters/import", {
    method: "POST",
    body: JSON.stringify({ card }),
  });
  return (await res.json()) as { ok: boolean; id: string };
}

export async function apiCreateSession(cfg: ApiConfig, characterId: string) {
  const res = await apiFetch(cfg, "/api/sessions", {
    method: "POST",
    body: JSON.stringify({ userId: cfg.userId, characterId }),
  });
  return (await res.json()) as { sessionId: string };
}

export async function apiGetMessages(cfg: ApiConfig, sessionId: string) {
  const res = await apiFetch(cfg, `/api/messages?sessionId=${encodeURIComponent(sessionId)}`);
  return (await res.json()) as { messages: Array<{ id: string; role: "user" | "assistant"; content: string; createdAt: string }> };
}

export async function apiGetMessagesSince(cfg: ApiConfig, sessionId: string, since: string) {
  const res = await apiFetch(cfg, `/api/messages?sessionId=${encodeURIComponent(sessionId)}&since=${encodeURIComponent(since)}`);
  return (await res.json()) as { messages: Array<{ id: string; role: "user" | "assistant"; content: string; createdAt: string }> };
}

export async function apiListSessions(cfg: ApiConfig) {
  const res = await apiFetch(cfg, `/api/sessions?userId=${encodeURIComponent(cfg.userId)}`);
  return (await res.json()) as {
    sessions: Array<{
      id: string;
      characterId: string;
      characterName: string;
      createdAt: string;
      lastMessageAt?: string | null;
      lastMessagePreview?: string;
    }>;
  };
}

export async function apiListSessionsSince(cfg: ApiConfig, since: string) {
  const res = await apiFetch(cfg, `/api/sessions?userId=${encodeURIComponent(cfg.userId)}&since=${encodeURIComponent(since)}`);
  return (await res.json()) as {
    sessions: Array<{
      id: string;
      characterId: string;
      characterName: string;
      createdAt: string;
      lastMessageAt?: string | null;
      lastMessagePreview?: string;
    }>;
  };
}

export async function apiDeleteSession(cfg: ApiConfig, sessionId: string) {
  const res = await apiFetch(cfg, `/api/sessions/${encodeURIComponent(sessionId)}?userId=${encodeURIComponent(cfg.userId)}`, {
    method: "DELETE",
  });
  return (await res.json()) as { ok: boolean };
}

export async function apiGetState(cfg: ApiConfig, params: { characterId: string; sessionId?: string }) {
  const res = await apiFetch(
    cfg,
    `/api/state?userId=${encodeURIComponent(cfg.userId)}&characterId=${encodeURIComponent(params.characterId)}${params.sessionId ? `&sessionId=${encodeURIComponent(params.sessionId)}` : ""}`
  );
  return (await res.json()) as {
    affection: { score: number; stage: string; petName: string | null; updatedAt: string | null; penaltyUntil?: string | null } | null;
    affectionStages?: Array<{ key: string; label: string; minScore: number; nsfw: "none" | "light" | "normal" | "full"; prompt?: string }>;
    memories: Array<{ id: string; type: string; content: string; importance: number; createdAt: string }>;
  };
}

export async function apiAdminGetAffectionStages(cfg: ApiConfig) {
  const res = await apiFetch(cfg, "/api/admin/affection/stages", { method: "GET" });
  return (await res.json()) as {
    ok: boolean;
    stages: Array<{ key: string; label: string; minScore: number; nsfw: "none" | "light" | "normal" | "full"; prompt?: string }> | null;
  };
}

export async function apiAdminSetAffectionStages(
  cfg: ApiConfig,
  stages: Array<{ key: string; label: string; minScore: number; nsfw: "none" | "light" | "normal" | "full"; prompt?: string }>,
) {
  const res = await apiFetch(cfg, "/api/admin/affection/stages", { method: "PUT", body: JSON.stringify({ stages }) });
  return (await res.json()) as { ok: boolean; error?: string };
}

export async function apiAdminGetAffectionTuning(cfg: ApiConfig) {
  const res = await apiFetch(cfg, "/api/admin/affection/tuning", { method: "GET" });
  return (await res.json()) as {
    ok: boolean;
    tuning: {
      initScore: number;
      clampMin: number;
      clampMax: number;
      hourlyCapPos: number;
      hourlyCapNeg: number;
      scoreMin?: number;
      scoreMax?: number;
      ruleWeights: Record<string, number>;
    } | null;
  };
}

export async function apiAdminSetAffectionTuning(
  cfg: ApiConfig,
  tuning: {
    initScore: number;
    clampMin: number;
    clampMax: number;
    hourlyCapPos: number;
    hourlyCapNeg: number;
    scoreMin?: number;
    scoreMax?: number;
    ruleWeights: Record<string, number>;
  },
) {
  const res = await apiFetch(cfg, "/api/admin/affection/tuning", { method: "PUT", body: JSON.stringify({ tuning }) });
  return (await res.json()) as { ok: boolean; error?: string };
}

export async function apiGetCharacterPreference(cfg: ApiConfig, characterId: string) {
  const res = await apiFetch(cfg, `/api/preferences/character?userId=${encodeURIComponent(cfg.userId)}&characterId=${encodeURIComponent(characterId)}`);
  return (await res.json()) as { nickname: string };
}

export async function apiUpdateCharacterPreference(cfg: ApiConfig, characterId: string, payload: { nickname?: string }) {
  await apiFetch(cfg, "/api/preferences/character", {
    method: "PATCH",
    body: JSON.stringify({ userId: cfg.userId, characterId, ...payload }),
  });
}

export async function apiUpdateSettingsLlm(
  cfg: ApiConfig,
  llm: { baseUrl: string; apiKey: string; modelChat: string; modelLight: string }
) {
  await apiFetch(cfg, "/api/settings/llm", {
    method: "PUT",
    body: JSON.stringify({ userId: cfg.userId, llm }),
  });
}

export async function apiArchiveMemory(cfg: ApiConfig, characterId: string, memoryId: string) {
  await apiFetch(cfg, "/api/memories/archive", {
    method: "POST",
    body: JSON.stringify({ userId: cfg.userId, characterId, memoryId }),
  });
}

export async function apiPinMemory(cfg: ApiConfig, characterId: string, memoryId: string, pinned: boolean) {
  await apiFetch(cfg, "/api/memories/pin", {
    method: "POST",
    body: JSON.stringify({ userId: cfg.userId, characterId, memoryId, pinned }),
  });
}

export async function apiUpdateMemory(cfg: ApiConfig, characterId: string, memoryId: string, content: string) {
  await apiFetch(cfg, "/api/memories/update", {
    method: "POST",
    body: JSON.stringify({ userId: cfg.userId, characterId, memoryId, content }),
  });
}

export async function apiMessagesAppend(params: {
  cfg: ApiConfig;
  sessionId: string;
  characterId: string;
  role: "user" | "assistant";
  content: string;
}) {
  const { cfg, sessionId, characterId, role, content } = params;
  const res = await apiFetch(cfg, "/api/messages/append", {
    method: "POST",
    body: JSON.stringify({
      userId: cfg.userId,
      sessionId,
      characterId,
      role,
      content,
      llmConfig: role === "assistant"
        ? { llmBaseUrl: cfg.llmBaseUrl, llmApiKey: cfg.llmApiKey, llmModelChat: cfg.llmModelChat, llmModelLight: cfg.llmModelLight }
        : undefined,
    }),
  });
  return (await res.json()) as { ok: boolean; id?: string; createdAt?: string; error?: string };
}

export async function apiStreamChat(params: {
  cfg: ApiConfig;
  sessionId: string;
  characterId: string;
  message: string;
  onToken: (t: string) => void;
}) {
  const { cfg, sessionId, characterId, message, onToken } = params;
  await apiMessagesAppend({
    cfg,
    sessionId,
    characterId,
    role: "user",
    content: message,
  });
  const baseUrl = cfg.llmBaseUrl || cfg.baseUrl;
  const apiKey = cfg.llmApiKey || "";
  const model = cfg.llmModelChat || cfg.llmModelLight || "";
  if (!baseUrl || !apiKey || !model) {
    throw new Error("LLM 配置缺失：请在设置中填写 Base URL / API Key / Model");
  }

  const systemBricks = await apiGetSettings(cfg).then((r) => r.promptBricks).catch(() => null);
  const state = await apiGetState(cfg, { characterId, sessionId }).catch(() => null);
  const stageKey = state?.affection?.stage ?? "";
  const stagePrompt = state?.affectionStages?.find((s) => s.key === stageKey)?.prompt ?? "";
  const memoryText = state?.memories?.length
    ? `长期记忆：\n${state.memories.map((m) => `- ${m.content}`).join("\n")}`
    : "";

  const systemContent = [
    systemBricks?.bricks
    ?.filter((b) => b.enabled)
    .map((b) => b.content)
    .filter((t) => t && t.trim())
    .join("\n")
    .trim(),
    stagePrompt?.trim() || "",
    memoryText?.trim() || "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  const history = await apiGetMessages(cfg, sessionId)
    .then((r) => r.messages ?? [])
    .catch(() => []);
  const limitedHistory = history.slice(-40);

  let res: Response;
  try {
    const url = `${String(baseUrl).replace(/\/+$/, "")}/v1/chat/completions`;
    const payload = {
      model,
      stream: true,
      messages: [
        ...(systemContent ? [{ role: "system", content: systemContent }] : []),
        ...limitedHistory.map((h) => ({ role: h.role, content: h.content })),
        { role: "user", content: message },
      ],
    };
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err: unknown) {
    const e = err as { message?: unknown };
    throw new Error(`网络请求失败（可能是后端地址不可达或协议不匹配）：${String(e?.message ?? err)}`);
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let gotAnyToken = false;
  let finalText = "";

  const normalizeAssistantToken = (s: string) => s.replace(/\r\n/g, "\n");

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    while (true) {
      const idx = buffer.indexOf("\n\n");
      if (idx === -1) break;
      const event = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of event.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let json: any = null;
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }
        const delta = json?.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          gotAnyToken = true;
          const token = normalizeAssistantToken(String(delta));
          finalText += token;
          onToken(token);
        }
      }
    }
  }
  if (!gotAnyToken) throw new Error("stream_incomplete");

  await apiMessagesAppend({
    cfg,
    sessionId,
    characterId,
    role: "assistant",
    content: finalText,
  });
}

export async function apiUploadAvatar(cfg: ApiConfig, file: File) {
  const form = new FormData();
  form.append("file", file);

  let res: Response;
  try {
    res = await fetch(apiUrl(cfg.baseUrl, "/api/uploads/avatar"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.authToken}`,
      },
      body: form,
    });
  } catch (err: unknown) {
    const e = err as { message?: unknown };
    throw new Error(`网络请求失败（可能是后端地址不可达或协议不匹配）：${String(e?.message ?? err)}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }

  return (await res.json()) as { url: string };
}

export async function apiUploadCharacterAvatar(cfg: ApiConfig, file: File) {
  const form = new FormData();
  form.append("file", file);

  let res: Response;
  try {
    res = await fetch(apiUrl(cfg.baseUrl, "/api/uploads/character-avatar"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.authToken}`,
      },
      body: form,
    });
  } catch (err: unknown) {
    const e = err as { message?: unknown };
    throw new Error(`网络请求失败（可能是后端地址不可达或协议不匹配）：${String(e?.message ?? err)}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }

  return (await res.json()) as { url: string };
}

export type MomentsPost = {
  id: string;
  user: { id: string; name: string; avatarUrl: string };
  content: string;
  media: Array<{ type: "image"; url: string }>;
  createdAt: string;
  updatedAt: string;
  likes: string[];
  likedByMe: boolean;
  comments: Array<{ id: string; userId: string; userName: string; userAvatarUrl?: string; content: string; createdAt: string }>;
};

export async function apiListMomentsPosts(cfg: ApiConfig, params?: { cursor?: string | null; limit?: number }) {
  const cursor = params?.cursor ?? null;
  const limit = params?.limit ?? 20;
  const q = new URLSearchParams({
    userId: cfg.userId,
    limit: String(limit),
  });
  if (cursor) q.set("cursor", cursor);
  const res = await apiFetch(cfg, `/api/moments/posts?${q.toString()}`, { method: "GET" });
  return (await res.json()) as { posts: MomentsPost[]; nextCursor: string | null };
}

export async function apiCreateMomentsPost(cfg: ApiConfig, payload: { content: string; media?: Array<{ type: "image"; url: string }> }) {
  const res = await apiFetch(cfg, "/api/moments/posts", {
    method: "POST",
    body: JSON.stringify({ userId: cfg.userId, content: payload.content, media: payload.media ?? [] }),
  });
  return (await res.json()) as { ok: boolean; id: string };
}

export async function apiCreateMomentsComment(cfg: ApiConfig, payload: { postId: string; content: string }) {
  const res = await apiFetch(cfg, "/api/moments/comments", {
    method: "POST",
    body: JSON.stringify({ userId: cfg.userId, postId: payload.postId, content: payload.content }),
  });
  return (await res.json()) as { ok: boolean; id: string; error?: string };
}

export async function apiToggleMomentsLike(cfg: ApiConfig, payload: { postId: string; liked: boolean }) {
  const res = await apiFetch(cfg, "/api/moments/like", {
    method: "POST",
    body: JSON.stringify({ userId: cfg.userId, postId: payload.postId, liked: payload.liked }),
  });
  return (await res.json()) as { ok: boolean; error?: string };
}
