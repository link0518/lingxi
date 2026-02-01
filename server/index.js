
import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import multer from "multer";
import { randomUUID, createHash } from "node:crypto";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createDb, ensureAffectionState, ensureDefaultPreset, ensureUserMeta, ensureUserPromptBricks, getAffectionTuning, getSyncMeta, listAffectionStages, logAffectionDelta, updateAffectionState, updateSyncMeta } from "./db.js";
import { authMiddleware, adminOnly, signToken } from "./auth.js";
import { defaultPromptBricks } from "./defaults.js";
import { buildMessages, callOpenAICompatible, pickModel } from "./llm.js";

const app = express();
const PORT = Number(process.env.PORT || 8787);

const db = createDb();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const UPLOAD_DIR = path.resolve(process.cwd(), "server", "data", "uploads");
const AVATAR_DIR = path.join(UPLOAD_DIR, "avatars");
const CHARACTER_AVATAR_DIR = path.join(UPLOAD_DIR, "character-avatars");
for (const dir of [UPLOAD_DIR, AVATAR_DIR, CHARACTER_AVATAR_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 2 * 1024 * 1024 } });

function now() {
  return new Date().toISOString();
}

function migrateLlmSettingsIfNeeded() {
  try {
    const cols = db.prepare("PRAGMA table_info(llm_settings)").all();
    const hasEnc = cols.some((c) => c?.name === "llm_api_key_enc");
    const hasPlain = cols.some((c) => c?.name === "llm_api_key");
    if (!hasEnc || !hasPlain) return;
    const keyOk = Boolean(getLlmSettingsKeyBytes());
    if (!keyOk) return;
    const rows = db.prepare("SELECT user_id, llm_api_key FROM llm_settings WHERE (llm_api_key_enc IS NULL OR llm_api_key_enc = '') AND llm_api_key IS NOT NULL AND llm_api_key != ''").all();
    if (!rows?.length) return;
    const upd = db.prepare("UPDATE llm_settings SET llm_api_key_enc = ?, updated_at = ? WHERE user_id = ?");
    for (const r of rows) {
      const enc = encryptSecret(String(r.llm_api_key ?? ""));
      if (!enc) continue;
      upd.run(enc, now(), r.user_id);
    }
  } catch {
    // ignore migration errors
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function readEnvBool(name, fallback = false) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return fallback;
}

function readEnvInt(name, fallback) {
  const raw = String(process.env[name] ?? "").trim();
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toMsHours(h) {
  return Math.max(0, Number(h) * 60 * 60 * 1000);
}

function parseIsoMs(iso) {
  const t = new Date(String(iso ?? "")).getTime();
  return Number.isFinite(t) ? t : NaN;
}

function hashPassword(raw) {
  return createHash("sha256").update(`lingxi:${raw}`).digest("hex");
}

function requireUser(req, res) {
  if (!req.auth?.userId) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return null;
  }
  return req.auth.userId;
}

function safeText(input, max = 5000) {
  const t = String(input ?? "");
  return t.length > max ? t.slice(0, max) : t;
}

function fetchUserByAccount(accountId) {
  return db.prepare("SELECT * FROM users WHERE account_id = ?").get(accountId);
}

function fetchAccountByUsername(username) {
  return db.prepare("SELECT * FROM accounts WHERE username = ?").get(username);
}

function fetchAccountById(id) {
  return db.prepare("SELECT * FROM accounts WHERE id = ?").get(id);
}

function ensureUser(userId) {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!user) throw new Error("用户不存在");
  return user;
}

function ensureSessionOwned(sessionId, userId) {
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
  if (!row || row.user_id !== userId) throw new Error("会话不存在或无权限");
  return row;
}

function ensureCharacterOwned(characterId, userId) {
  const row = db.prepare("SELECT * FROM characters WHERE id = ?").get(characterId);
  if (!row || row.owner_user_id !== userId) throw new Error("角色不存在或无权限");
  return row;
}

function listSessionMessages(sessionId, since) {
  if (since) {
    return db
      .prepare("SELECT id, role, content, created_at FROM messages WHERE session_id = ? AND created_at > ? ORDER BY created_at ASC")
      .all(sessionId, since);
  }
  return db.prepare("SELECT id, role, content, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC").all(sessionId);
}

function updateMessagesSyncMeta(userId, sessionId) {
  const meta = getSyncMeta(db, userId);
  const prev = meta?.messages_updated_at_json ? JSON.parse(meta.messages_updated_at_json) : {};
  const next = { ...prev, [sessionId]: now() };
  updateSyncMeta(db, userId, { messages_updated_at_json: JSON.stringify(next) });
}

function normalizePublicUser(u) {
  return {
    userId: u.id,
    displayName: u.display_name,
    avatarUrl: u.avatar_url,
    personaText: u.persona_text,
  };
}

function extractPromptBricks(payload) {
  const raw = payload?.promptBricks ?? payload?.bricks;
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.bricks)) {
    throw new Error("promptBricks 格式不正确");
  }
  const bricks = raw.bricks.map((b) => ({
    id: String(b.id),
    title: String(b.title ?? ""),
    enabled: Boolean(b.enabled),
    content: String(b.content ?? ""),
  }));
  return { version: 1, bricks };
}

function ensureInviteCode(code) {
  const row = db.prepare("SELECT * FROM invites WHERE code = ?").get(code);
  if (!row) throw new Error("invite_code_invalid");
  if (row.used_at || row.used_by_account_id) throw new Error("invite_code_invalid");
  return row;
}

function parseLlmConfigFromRequest(cfg) {
  if (!cfg || typeof cfg !== "object") return null;
  const baseUrl = String(cfg.llmBaseUrl ?? "").trim();
  const apiKey = String(cfg.llmApiKey ?? "").trim();
  const llmModelChat = String(cfg.llmModelChat ?? "").trim();
  const llmModelLight = String(cfg.llmModelLight ?? "").trim();
  return { llmBaseUrl: baseUrl, llmApiKey: apiKey, llmModelChat, llmModelLight };
}

function getLlmSettingsKeyBytes() {
  const raw = String(process.env.LLM_SETTINGS_KEY ?? "").trim();
  if (!raw) return null;
  try {
    const buf = Buffer.from(raw, "base64");
    if (buf.length !== 32) return null;
    return buf;
  } catch {
    return null;
  }
}

function encryptSecret(plaintext) {
  const key = getLlmSettingsKeyBytes();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

function decryptSecret(enc) {
  const key = getLlmSettingsKeyBytes();
  if (!key) return null;
  const raw = String(enc ?? "").trim();
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  try {
    const iv = Buffer.from(parts[0], "base64");
    const tag = Buffer.from(parts[1], "base64");
    const data = Buffer.from(parts[2], "base64");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(data), decipher.final()]);
    return out.toString("utf8");
  } catch {
    return null;
  }
}

function getIdleNudgeLlmConfigForUser(userId) {
  const row = db.prepare("SELECT * FROM llm_settings WHERE user_id = ?").get(userId);
  const baseUrl = String(row?.llm_base_url ?? "").trim();
  const apiKey = decryptSecret(row?.llm_api_key_enc) ?? "";
  const modelChat = String(row?.llm_model_chat ?? "").trim();
  const modelLight = String(row?.llm_model_light ?? "").trim();
  if (baseUrl && apiKey && (modelLight || modelChat)) {
    return { llmBaseUrl: baseUrl, llmApiKey: apiKey, llmModelChat: modelChat, llmModelLight: modelLight };
  }
  return {
    llmBaseUrl: process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || "",
    llmApiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "",
    llmModelChat: process.env.LLM_MODEL_CHAT || "",
    llmModelLight: process.env.LLM_MODEL_LIGHT || process.env.LLM_MODEL_TASK || process.env.LLM_MODEL_SMALL || "",
  };
}

function buildCharacterPrompt(card) {
  if (!card) return "";
  const lines = [];
  const name = String(card.name ?? "").trim();
  const relationship = String(card.relationship ?? "").trim();
  const background = String(card.background ?? "").trim();
  const traits = Array.isArray(card.traits) ? card.traits : [];
  const speechHabits = Array.isArray(card.speechHabits) ? card.speechHabits : [];
  const boundaries = Array.isArray(card.boundaries) ? card.boundaries : [];
  const catchphrases = Array.isArray(card.catchphrases) ? card.catchphrases : [];
  if (name) lines.push(`角色名：${name}`);
  if (relationship) lines.push(`角色关系/身份：${relationship}`);
  if (background) lines.push(`背景设定：${background}`);
  if (traits.length) lines.push(`性格特质：${traits.join("，")}`);
  if (speechHabits.length) lines.push(`说话习惯：${speechHabits.join("；")}`);
  if (boundaries.length) lines.push(`边界约束：${boundaries.join("；")}`);
  if (catchphrases.length) lines.push(`口头禅：${catchphrases.join("；")}`);
  return lines.length ? `角色设定：\n${lines.join("\n")}` : "";
}

function buildIdleNudgeInstruction(nudgeIndex) {
  const baseHard = [
    "你正在聊天软件里，以第一人称“我”说话。你就是角色卡里的角色，不允许出戏。",
    "硬性禁止：提及 AI/模型/系统/提示词/规则/训练/程序/政策。",
    "输出格式强制：只输出聊天气泡里的“台词文本”，不写任何括号动作/舞台指示/心理描写/环境叙述。",
    "长度强制：1 段为主，最多 2 句；口语自然，不要长篇。",
    "态度强制：不逼问、不控诉、不道德绑架；给对方留台阶（忙也没关系）。",
  ];

  const level = (() => {
    if (nudgeIndex === 1) {
      return "这是第 1 次未回复提醒（12小时）。情绪：轻轻想念 + 关心，几乎不失落，像随口问候。";
    }
    if (nudgeIndex === 2) {
      return "这是第 2 次未回复提醒（24小时）。情绪：更想念，出现轻微失落/空落，但语气仍温柔克制。";
    }
    return "这是第 3 次未回复提醒（48小时）。情绪：想念最强，失落更明显（直白表达），但仍不责怪、不施压。";
  })();

  const extra = [
    "只写 1 条消息，不要列清单，不要问超过 1 个问题。",
    "不要机械复用前两次句式；要自然像真人发的。",
  ];

  return ["【主动关心消息写作指令】", ...baseHard, level, ...extra].join("\n");
}

async function generateIdleNudgeText({ llmCfg, systemContent, history, nudgeIndex }) {
  const model = pickModel(llmCfg).light;
  const userMessage = [
    "用户已经长时间没有回复，你需要发出一条自然的关心消息。",
    "只输出台词文本本身。",
  ].join("\n");
  const messages = buildMessages({
    system: [systemContent, buildIdleNudgeInstruction(nudgeIndex)].filter(Boolean).join("\n\n"),
    history,
    userMessage,
  });
  const res = await callOpenAICompatible({
    baseUrl: llmCfg.llmBaseUrl,
    apiKey: llmCfg.llmApiKey,
    model,
    messages,
    stream: false,
  });
  const data = await res.json();
  const raw = String(data?.choices?.[0]?.message?.content ?? "");
  return safeText(raw, 800).trim();
}

async function runIdleNudgeSweep() {
  if (!readEnvBool("IDLE_NUDGE_ENABLED", false)) return;

  const intervalMin = readEnvInt("IDLE_NUDGE_SCAN_INTERVAL_MINUTES", 10);
  const historyLimit = Math.max(10, Math.min(80, readEnvInt("IDLE_NUDGE_HISTORY_LIMIT", 40)));
  const maxSendsPerSweep = Math.max(0, readEnvInt("IDLE_NUDGE_MAX_SENDS_PER_SWEEP", 20));
  const logEnabled = readEnvBool("IDLE_NUDGE_LOG_ENABLED", true);
  const scheduleHours = [12, 24, 48];

  let sentCount = 0;
  const startedAtMs = Date.now();
  const log = (msg) => {
    if (!logEnabled) return;
    // 轻量日志：避免打印敏感信息
    console.log(`[idle_nudge] ${msg}`);
  };

  const users = db.prepare("SELECT * FROM users").all();
  for (const user of users) {
    if (!user?.id) continue;
    if (maxSendsPerSweep > 0 && sentCount >= maxSendsPerSweep) break;

    const session = db
      .prepare("SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1")
      .get(user.id);
    if (!session?.id) continue;

    const lastAssistant = db
      .prepare("SELECT created_at FROM messages WHERE session_id = ? AND role = 'assistant' ORDER BY created_at DESC LIMIT 1")
      .get(session.id);
    const lastUser = db
      .prepare("SELECT created_at FROM messages WHERE session_id = ? AND role = 'user' ORDER BY created_at DESC LIMIT 1")
      .get(session.id);

    const lastAssistantAt = String(lastAssistant?.created_at ?? "").trim();
    if (!lastAssistantAt) continue;
    const aMs = parseIsoMs(lastAssistantAt);
    if (!Number.isFinite(aMs)) continue;

    const lastUserAt = String(lastUser?.created_at ?? "").trim();
    const uMs = lastUserAt ? parseIsoMs(lastUserAt) : NaN;
    if (Number.isFinite(uMs) && uMs > aMs) continue;

    const nowMs = Date.now();
    const diffMs = nowMs - aMs;

    let nudgeIndex = 0;
    for (let i = 0; i < scheduleHours.length; i++) {
      if (diffMs >= toMsHours(scheduleHours[i])) nudgeIndex = i + 1;
    }
    if (nudgeIndex <= 0) continue;

    const exists = db
      .prepare("SELECT * FROM idle_nudges WHERE session_id = ? AND last_assistant_at = ? AND nudge_index = ? LIMIT 1")
      .get(session.id, lastAssistantAt, nudgeIndex);
    if (exists?.sent_message_id) continue;

    const scheduledAt = new Date(aMs + toMsHours(scheduleHours[nudgeIndex - 1])).toISOString();

    let nudgeId = exists?.id;
    if (!nudgeId) {
      nudgeId = randomUUID();
      try {
        db.prepare(
          "INSERT INTO idle_nudges (id, user_id, session_id, last_assistant_at, nudge_index, scheduled_at, sent_message_id, sent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)"
        ).run(nudgeId, user.id, session.id, lastAssistantAt, nudgeIndex, scheduledAt, now());
      } catch {
        // 可能并发/重复插入，继续走查询
        nudgeId = db
          .prepare("SELECT id FROM idle_nudges WHERE session_id = ? AND last_assistant_at = ? AND nudge_index = ? LIMIT 1")
          .get(session.id, lastAssistantAt, nudgeIndex)?.id;
        if (!nudgeId) continue;
      }
    }

    // 发送前再次校验：避免扫到之后用户刚发言
    const lastUserAgain = db
      .prepare("SELECT created_at FROM messages WHERE session_id = ? AND role = 'user' ORDER BY created_at DESC LIMIT 1")
      .get(session.id);
    const lastUserAgainAt = String(lastUserAgain?.created_at ?? "").trim();
    const u2 = lastUserAgainAt ? parseIsoMs(lastUserAgainAt) : NaN;
    if (Number.isFinite(u2) && u2 > aMs) continue;

    // 组装 prompt：全局提示词 + 角色卡 + 用户设定 + 共同硬约束（写作指令）
    ensureUserPromptBricks(db, user.id);
    const bricksRow = db.prepare("SELECT bricks_json FROM prompt_bricks WHERE user_id = ?").get(user.id);
    const promptBricks = bricksRow?.bricks_json ? JSON.parse(bricksRow.bricks_json) : defaultPromptBricks();
    const globalText = promptBricks?.bricks
      ?.filter((b) => b.enabled)
      .map((b) => String(b.content ?? ""))
      .filter((t) => t && t.trim())
      .join("\n")
      .trim();

    const character = db.prepare("SELECT * FROM characters WHERE id = ?").get(session.character_id);
    let card = null;
    try {
      card = character?.card_json ? JSON.parse(character.card_json) : null;
    } catch {
      card = null;
    }
    const characterPrompt = buildCharacterPrompt(card);
    ensureAffectionState(db, user.id, session.character_id);
    const affection = db.prepare("SELECT stage FROM affection_state WHERE user_id = ? AND character_id = ?").get(user.id, session.character_id);
    const stageKey = String(affection?.stage ?? "");
    const stagePrompt = db.prepare("SELECT prompt FROM affection_stages WHERE key = ?").get(stageKey)?.prompt ?? "";
    const memories = db
      .prepare("SELECT content FROM memories WHERE user_id = ? AND character_id = ? AND archived = 0 ORDER BY created_at DESC LIMIT 40")
      .all(user.id, session.character_id);
    const memoryText = memories?.length ? `长期记忆：\n${memories.map((m) => `- ${m.content}`).join("\n")}` : "";
    const userPersona = String(user.persona_text ?? "").trim();
    const userPersonaText = userPersona ? `用户设定：\n${userPersona}` : "";

    const systemContent = [globalText, characterPrompt, stagePrompt, memoryText, userPersonaText].filter(Boolean).join("\n\n").trim();

    const history = db
      .prepare("SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(session.id, historyLimit)
      .reverse()
      .map((m) => ({ role: m.role, content: m.content }));

    // llmCfg：使用“轻量任务模型”
    const llmCfg = getIdleNudgeLlmConfigForUser(user.id);
    if (!llmCfg.llmBaseUrl || !llmCfg.llmApiKey || !pickModel(llmCfg).light) continue;

    let text = "";
    try {
      text = await generateIdleNudgeText({ llmCfg, systemContent, history, nudgeIndex });
    } catch {
      continue;
    }
    if (!text) continue;

    const msgId = randomUUID();
    const createdAt = now();
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(msgId, session.id, "assistant", safeText(text, 8000), createdAt);
    db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(createdAt, session.id);
    updateMessagesSyncMeta(user.id, session.id);
    updateSyncMeta(db, user.id, { sessions_updated_at: createdAt });
    db.prepare("UPDATE idle_nudges SET sent_message_id = ?, sent_at = ? WHERE id = ?").run(msgId, createdAt, nudgeId);

    sentCount += 1;
    log(`sent nudge#${nudgeIndex} user=${user.id} session=${session.id}`);

    // 限速：避免一个 sweep 内连续打爆 LLM
    await sleep(200);
  }

  if (sentCount > 0) {
    const costMs = Date.now() - startedAtMs;
    log(`sweep done sent=${sentCount} costMs=${costMs} intervalMin=${intervalMin}`);
  }
}

const IDLE_NUDGE_SCAN_INTERVAL_MINUTES = readEnvInt("IDLE_NUDGE_SCAN_INTERVAL_MINUTES", 10);
if (IDLE_NUDGE_SCAN_INTERVAL_MINUTES > 0) {
  setInterval(() => {
    runIdleNudgeSweep().catch(() => null);
  }, IDLE_NUDGE_SCAN_INTERVAL_MINUTES * 60 * 1000).unref?.();
}

migrateLlmSettingsIfNeeded();

function calculateRuleDelta(text) {
  const t = String(text || "").toLowerCase();
  let score = 0;
  if (/(谢谢|多谢|感激|thx|thanks)/i.test(t)) score += 1.2;
  if (/(喜欢|想你|在意|珍惜|爱你|抱抱|想抱|么么|亲亲)/i.test(t)) score += 1.5;
  if (/(对不起|抱歉|我错|失礼)/i.test(t)) score += 0.6;
  if (/(一直|永远|只要|陪着)/i.test(t)) score += 0.8;
  if (/(烦|滚|闭嘴|讨厌|恶心|垃圾|蠢|傻|笨)/i.test(t)) score -= 2.0;
  if (/(命令|必须|立刻|马上|给我)/i.test(t)) score -= 0.6;
  if (/(分手|拉黑|不理你)/i.test(t)) score -= 1.2;
  return score;
}

function clampDelta(delta, tuning) {
  const min = Number(tuning?.clampMin ?? -8);
  const max = Number(tuning?.clampMax ?? 6);
  return Math.max(min, Math.min(max, delta));
}

function clampScore(score, tuning) {
  const min = Number(tuning?.scoreMin ?? 0);
  const max = Number(tuning?.scoreMax ?? 100);
  return Math.max(min, Math.min(max, score));
}

function applyHourlyCap(db, userId, characterId, delta, tuning) {
  const nowIso = now();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const rows = db.prepare("SELECT delta FROM affection_log WHERE user_id = ? AND character_id = ? AND created_at > ?")
    .all(userId, characterId, since);
  const sumPos = rows.filter((r) => r.delta > 0).reduce((a, b) => a + b.delta, 0);
  const sumNeg = rows.filter((r) => r.delta < 0).reduce((a, b) => a + b.delta, 0);
  const capPos = Number(tuning?.hourlyCapPos ?? 8);
  const capNeg = Number(tuning?.hourlyCapNeg ?? 12);
  let next = delta;
  if (delta > 0 && sumPos + delta > capPos) next = Math.max(0, capPos - sumPos);
  if (delta < 0 && Math.abs(sumNeg + delta) > capNeg) next = Math.min(0, -capNeg - sumNeg);
  return { delta: next, nowIso };
}

async function scoreByTaskModel(cfg, userMessage, assistantMessage) {
  const model = cfg?.llmModelLight || cfg?.llmModelChat;
  if (!cfg?.llmBaseUrl || !cfg?.llmApiKey || !model) return { delta: 0, reason: "missing_llm" };
  const system = "你是情感评分器，只返回JSON。输出格式：{\"delta\": number, \"reason\": string}";
  const content = `用户消息：${userMessage}\nAI回复：${assistantMessage}\n请输出 delta（-5~5），正数代表好感度增加，负数代表降低。`;
  const res = await callOpenAICompatible({
    baseUrl: cfg.llmBaseUrl,
    apiKey: cfg.llmApiKey,
    model,
    messages: [{ role: "system", content: system }, { role: "user", content }],
    stream: false,
  });
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? "";
  try {
    const parsed = JSON.parse(String(raw));
    const delta = Number(parsed?.delta ?? 0);
    return { delta: Number.isFinite(delta) ? delta : 0, reason: String(parsed?.reason ?? "") };
  } catch {
    return { delta: 0, reason: "parse_failed" };
  }
}

function pickSessionPreview(sessionId) {
  const last = db.prepare("SELECT content, created_at FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT 1").get(sessionId);
  return {
    lastMessageAt: last?.created_at ?? null,
    lastMessagePreview: last?.content ? String(last.content).slice(0, 80) : "",
  };
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/register", (req, res) => {
  try {
    const username = safeText(req.body?.username, 64).trim();
    const password = String(req.body?.password ?? "");
    const inviteCode = safeText(req.body?.inviteCode, 64).trim();
    if (!username || !password || !inviteCode) {
      return res.status(400).json({ ok: false, error: "invalid_params" });
    }
    if (fetchAccountByUsername(username)) {
      return res.status(409).json({ ok: false, error: "username_taken" });
    }
    const invite = ensureInviteCode(inviteCode);
    const accountId = randomUUID();
    const userId = randomUUID();
    const createdAt = now();
    db.prepare("INSERT INTO accounts (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(accountId, username, hashPassword(password), "user", createdAt);
    db.prepare("INSERT INTO users (id, account_id, display_name, avatar_url, persona_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(userId, accountId, username, "", "", createdAt, createdAt);
    db.prepare("UPDATE invites SET used_at = ?, used_by_account_id = ? WHERE code = ?").run(createdAt, accountId, invite.code);
    ensureUserMeta(db, userId);
    ensureUserPromptBricks(db, userId);
    ensureDefaultPreset(db, userId);
    const token = signToken({ userId, accountId, role: "user", username });
    res.json({ ok: true, token, userId, role: "user" });
  } catch (e) {
    const msg = String(e?.message ?? e);
    const status = msg === "invite_code_invalid" ? 400 : 500;
    res.status(status).json({ ok: false, error: msg });
  }
});

app.post("/api/auth/login", (req, res) => {
  try {
    const username = safeText(req.body?.username, 64).trim();
    const password = String(req.body?.password ?? "");
    const account = fetchAccountByUsername(username);
    if (!account || account.password_hash !== hashPassword(password)) {
      return res.status(401).json({ ok: false, error: "invalid_credentials" });
    }
    const user = fetchUserByAccount(account.id);
    if (!user) return res.status(500).json({ ok: false, error: "user_missing" });
    ensureUserMeta(db, user.id);
    ensureUserPromptBricks(db, user.id);
    ensureDefaultPreset(db, user.id);
    const token = signToken({ userId: user.id, accountId: account.id, role: account.role, username: account.username });
    res.json({ ok: true, token, userId: user.id, role: account.role });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  try {
    const account = fetchAccountById(req.auth.accountId);
    if (!account) return res.status(404).json({ ok: false, error: "account_missing" });
    res.json({ ok: true, userId: req.auth.userId, role: account.role, username: account.username });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.post("/api/auth/change-password", authMiddleware, (req, res) => {
  try {
    const oldPassword = String(req.body?.oldPassword ?? "");
    const newPassword = String(req.body?.newPassword ?? "");
    if (!oldPassword || !newPassword) return res.status(400).json({ ok: false, error: "invalid_params" });
    const account = fetchAccountById(req.auth.accountId);
    if (!account || account.password_hash !== hashPassword(oldPassword)) {
      return res.status(400).json({ ok: false, error: "invalid_credentials" });
    }
    db.prepare("UPDATE accounts SET password_hash = ? WHERE id = ?").run(hashPassword(newPassword), account.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.post("/api/users", authMiddleware, (req, res) => {
  try {
    const userId = req.auth.userId;
    const user = fetchUserByAccount(req.auth.accountId);
    if (user) return res.json({ userId: user.id });
    const createdAt = now();
    const newUserId = randomUUID();
    db.prepare("INSERT INTO users (id, account_id, display_name, avatar_url, persona_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(newUserId, req.auth.accountId, req.auth.username || "灵犀用户", "", "", createdAt, createdAt);
    res.json({ userId: newUserId });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.get("/api/users/me", authMiddleware, (req, res) => {
  try {
    const userId = req.query.userId || req.auth.userId;
    if (userId !== req.auth.userId) return res.status(403).json({ ok: false, error: "forbidden" });
    const user = ensureUser(userId);
    res.json(normalizePublicUser(user));
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.put("/api/users/me", authMiddleware, (req, res) => {
  try {
    const userId = req.body?.userId || req.auth.userId;
    if (userId !== req.auth.userId) return res.status(403).json({ ok: false, error: "forbidden" });
    const payload = req.body || {};
    const displayName = safeText(payload.displayName ?? "", 64);
    const avatarUrl = safeText(payload.avatarUrl ?? "", 255);
    const personaText = safeText(payload.personaText ?? "", 2000);
    db.prepare("UPDATE users SET display_name = ?, avatar_url = ?, persona_text = ?, updated_at = ? WHERE id = ?")
      .run(displayName, avatarUrl, personaText, now(), userId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.post("/api/characters/seed", authMiddleware, (req, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const count = db.prepare("SELECT COUNT(*) AS c FROM characters WHERE owner_user_id = ?").get(userId).c;
    if (count > 0) return res.json({ ok: true, created: 0 });
    const sample = [
      { name: "澪", background: "安静温柔的同桌，喜欢在夜里聊天。", relationship: "朋友" },
      { name: "栀子", background: "天真浪漫的摄影师，总能发现生活的美。", relationship: "恋人" },
    ];
    const createdAt = now();
    const insert = db.prepare(
      "INSERT INTO characters (id, owner_user_id, name, gender, avatar_url, persona_background, persona_traits, persona_speech_habits, card_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    for (const s of sample) {
      const card = {
        version: 1,
        name: s.name,
        relationship: s.relationship,
        background: s.background,
        traits: [],
        speechHabits: [],
        boundaries: [],
        catchphrases: [],
        style: { sweetness: "medium", proactivity: "medium", messageDensity: "balanced" },
      };
      insert.run(randomUUID(), userId, s.name, "female", "", s.background, "", "", JSON.stringify(card), createdAt, createdAt);
    }
    updateSyncMeta(db, userId, { characters_updated_at: now() });
    res.json({ ok: true, created: sample.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.get("/api/characters", authMiddleware, (req, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const since = String(req.query.since ?? "").trim();
    const rows = since
      ? db.prepare("SELECT * FROM characters WHERE owner_user_id = ? AND updated_at > ? ORDER BY updated_at ASC").all(userId, since)
      : db.prepare("SELECT * FROM characters WHERE owner_user_id = ? ORDER BY updated_at DESC").all(userId);
    const characters = rows.map((c) => ({
      id: c.id,
      name: c.name,
      gender: c.gender,
      avatarUrl: c.avatar_url,
      tagline: c.persona_background ? String(c.persona_background).slice(0, 24) : "",
      updatedAt: c.updated_at,
    }));
    res.json({ characters });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.get("/api/characters/:id", authMiddleware, (req, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const character = ensureCharacterOwned(req.params.id, userId);
    let card = null;
    try {
      card = JSON.parse(character.card_json);
    } catch {
      card = {
        version: 1,
        name: character.name,
        relationship: "",
        background: character.persona_background,
        traits: [],
        speechHabits: [],
        boundaries: [],
        catchphrases: [],
      };
    }
    res.json({
      id: character.id,
      name: character.name,
      gender: character.gender,
      avatarUrl: character.avatar_url,
      persona_background: character.persona_background,
      persona_traits: character.persona_traits,
      persona_speech_habits: character.persona_speech_habits,
      card,
    });
  } catch (e) {
    res.status(404).json({ error: String(e?.message ?? e) });
  }
});

app.put("/api/characters/:id", authMiddleware, (req, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const character = ensureCharacterOwned(req.params.id, userId);
    const { name, gender, avatarUrl } = req.body ?? {};
    const nextName = name ? safeText(name, 64) : character.name;
    const nextGender = gender ? String(gender) : character.gender;
    const nextAvatar = avatarUrl ? safeText(avatarUrl, 255) : character.avatar_url;
    db.prepare("UPDATE characters SET name = ?, gender = ?, avatar_url = ?, updated_at = ? WHERE id = ?")
      .run(nextName, nextGender, nextAvatar, now(), character.id);
    updateSyncMeta(db, userId, { characters_updated_at: now() });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.put("/api/characters/:id/card", authMiddleware, (req, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const character = ensureCharacterOwned(req.params.id, userId);
    const card = req.body ?? {};
    const cardJson = JSON.stringify(card);
    db.prepare("UPDATE characters SET card_json = ?, persona_background = ?, updated_at = ? WHERE id = ?")
      .run(cardJson, safeText(card.background ?? "", 4000), now(), character.id);
    updateSyncMeta(db, userId, { characters_updated_at: now() });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.delete("/api/characters/:id", authMiddleware, (req, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    ensureCharacterOwned(req.params.id, userId);
    db.prepare("DELETE FROM characters WHERE id = ?").run(req.params.id);
    updateSyncMeta(db, userId, { characters_updated_at: now(), sessions_updated_at: now() });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.post("/api/characters/import", authMiddleware, (req, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const card = req.body?.card;
    if (!card || !card.name) return res.status(400).json({ ok: false, error: "invalid_card" });
    const createdAt = now();
    const id = randomUUID();
    db.prepare("INSERT INTO characters (id, owner_user_id, name, gender, avatar_url, persona_background, persona_traits, persona_speech_habits, card_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        id,
        userId,
        safeText(card.name, 64),
        "female",
        "",
        safeText(card.background ?? "", 4000),
        "",
        "",
        JSON.stringify(card),
        createdAt,
        createdAt
      );
    updateSyncMeta(db, userId, { characters_updated_at: now() });
    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.post("/api/sessions", authMiddleware, (req, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const characterId = String(req.body?.characterId ?? "");
    if (!characterId) return res.status(400).json({ ok: false, error: "invalid_character" });
    ensureCharacterOwned(characterId, userId);
    const existing = db.prepare("SELECT * FROM sessions WHERE user_id = ? AND character_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1")
      .get(userId, characterId);
    if (existing) {
      return res.json({ sessionId: existing.id });
    }
    const id = randomUUID();
    const createdAt = now();
    db.prepare("INSERT INTO sessions (id, user_id, character_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, userId, characterId, "active", createdAt, createdAt);
    updateSyncMeta(db, userId, { sessions_updated_at: now() });
    res.json({ sessionId: id });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.get("/api/sessions", authMiddleware, (req, res) => {
  try {
    const userId = String(req.query.userId ?? "");
    if (!userId || userId !== req.auth.userId) return res.status(403).json({ ok: false, error: "forbidden" });
    const since = String(req.query.since ?? "").trim();
    const rows = since
      ? db.prepare("SELECT * FROM sessions WHERE user_id = ? AND updated_at > ? ORDER BY updated_at DESC").all(userId, since)
      : db.prepare("SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC").all(userId);
    const sessions = rows.map((s) => {
      const character = db.prepare("SELECT name FROM characters WHERE id = ?").get(s.character_id);
      const preview = pickSessionPreview(s.id);
      return {
        id: s.id,
        characterId: s.character_id,
        characterName: character?.name ?? "角色",
        createdAt: s.created_at,
        ...preview,
      };
    });
    res.json({ sessions });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.delete("/api/sessions/:id", authMiddleware, (req, res) => {
  try {
    const userId = String(req.query.userId ?? "");
    if (!userId || userId !== req.auth.userId) return res.status(403).json({ ok: false, error: "forbidden" });
    ensureSessionOwned(req.params.id, userId);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(req.params.id);
    updateSyncMeta(db, userId, { sessions_updated_at: now() });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.get("/api/messages", authMiddleware, (req, res) => {
  try {
    const sessionId = String(req.query.sessionId ?? "");
    if (!sessionId) return res.status(400).json({ ok: false, error: "invalid_session" });
    const session = ensureSessionOwned(sessionId, req.auth.userId);
    const since = String(req.query.since ?? "").trim();
    const messages = listSessionMessages(session.id, since).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.created_at,
    }));
    res.json({ messages });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.post("/api/messages/append", authMiddleware, async (req, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const sessionId = String(req.body?.sessionId ?? "");
    const characterId = String(req.body?.characterId ?? "");
    const role = String(req.body?.role ?? "user");
    const content = safeText(req.body?.content ?? "", 8000);
    const llmConfig = req.body?.llmConfig ?? null;
    if (!sessionId || !characterId || !content) return res.status(400).json({ ok: false, error: "invalid_params" });
    ensureCharacterOwned(characterId, userId);
    const session = ensureSessionOwned(sessionId, userId);
    if (session.character_id !== characterId) return res.status(400).json({ ok: false, error: "character_mismatch" });
    const id = randomUUID();
    const createdAt = now();
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
    db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(createdAt, sessionId);
    updateMessagesSyncMeta(userId, sessionId);
    updateSyncMeta(db, userId, { sessions_updated_at: createdAt });

    try {
      if (role === "assistant") {
        try {
          const parsed = parseLlmConfigFromRequest(llmConfig);
          if (parsed?.llmBaseUrl && parsed?.llmApiKey && (parsed.llmModelLight || parsed.llmModelChat)) {
            const encKey = encryptSecret(parsed.llmApiKey);
            if (!encKey) throw new Error("LLM_SETTINGS_KEY_missing");
            const row = db.prepare("SELECT user_id FROM llm_settings WHERE user_id = ?").get(userId);
            if (row) {
              db.prepare("UPDATE llm_settings SET llm_base_url = ?, llm_api_key_enc = ?, llm_model_chat = ?, llm_model_light = ?, updated_at = ? WHERE user_id = ?")
                .run(parsed.llmBaseUrl, encKey, parsed.llmModelChat, parsed.llmModelLight, now(), userId);
            } else {
              db.prepare("INSERT INTO llm_settings (user_id, llm_base_url, llm_api_key_enc, llm_model_chat, llm_model_light, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
                .run(userId, parsed.llmBaseUrl, encKey, parsed.llmModelChat, parsed.llmModelLight, now());
            }
          }
        } catch {
          // ignore llm settings errors
        }
        ensureAffectionState(db, userId, characterId);
        const lastUser = db.prepare("SELECT content FROM messages WHERE session_id = ? AND role = 'user' ORDER BY created_at DESC LIMIT 1")
          .get(sessionId);
        const userText = String(lastUser?.content ?? "");
        const assistantText = String(content ?? "");
        const tuning = getAffectionTuning(db);
        const ruleDelta = clampDelta(calculateRuleDelta(userText), tuning);
        const task = await scoreByTaskModel(llmConfig, userText, assistantText);
        const taskDelta = clampDelta(Number(task.delta ?? 0), tuning);
        let mixed = ruleDelta + taskDelta;
        mixed = clampDelta(mixed, tuning);
        const capped = applyHourlyCap(db, userId, characterId, mixed, tuning).delta;
        if (capped !== 0) {
          const current = db.prepare("SELECT score FROM affection_state WHERE user_id = ? AND character_id = ?").get(userId, characterId);
          const nextScore = clampScore(Number(current?.score ?? tuning.initScore ?? 0) + capped, tuning);
          updateAffectionState(db, userId, characterId, nextScore);
          logAffectionDelta(db, userId, characterId, capped, "mixed");
        }

        const totalCount = db.prepare("SELECT COUNT(*) AS c FROM messages WHERE session_id = ?").get(sessionId)?.c ?? 0;
        if (totalCount > 0 && totalCount % 10 === 0) {
          const memories = await extractSummaryWithLLM(llmConfig, userText, assistantText);
          if (memories.length) {
            const insert = db.prepare("INSERT INTO memories (id, user_id, character_id, type, content, importance, pinned, archived, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            const createdAt = now();
            for (const m of memories) {
              insert.run(randomUUID(), userId, characterId, "summary", m.content, m.importance, 0, 0, createdAt);
            }
          }
        }
      }
    } catch {
      // ignore affection errors
    }
    res.json({ ok: true, id, createdAt });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.get("/api/state", authMiddleware, (req, res) => {
  try {
    const userId = String(req.query.userId ?? "");
    const characterId = String(req.query.characterId ?? "");
    if (!userId || userId !== req.auth.userId) return res.status(403).json({ ok: false, error: "forbidden" });
    ensureCharacterOwned(characterId, userId);
    ensureAffectionState(db, userId, characterId);
    const affection = db.prepare("SELECT * FROM affection_state WHERE user_id = ? AND character_id = ?").get(userId, characterId);
    const memories = db.prepare("SELECT id, type, content, importance, created_at FROM memories WHERE user_id = ? AND character_id = ? AND archived = 0 ORDER BY created_at DESC LIMIT 40")
      .all(userId, characterId);
    const stages = db.prepare("SELECT key, label, min_score, nsfw FROM affection_stages ORDER BY min_score ASC").all();
    res.json({
      affection: affection
        ? {
            score: affection.score,
            stage: affection.stage,
            petName: affection.pet_name,
            updatedAt: affection.updated_at,
            penaltyUntil: null,
          }
        : null,
      affectionStages: stages.map((s) => ({ key: s.key, label: s.label, minScore: s.min_score, nsfw: s.nsfw })),
      memories: memories.map((m) => ({ id: m.id, type: m.type, content: m.content, importance: m.importance, createdAt: m.created_at })),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.post("/api/memories/archive", authMiddleware, (req, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const { characterId, memoryId } = req.body ?? {};
    ensureCharacterOwned(characterId, userId);
    db.prepare("UPDATE memories SET archived = 1 WHERE id = ? AND user_id = ? AND character_id = ?")
      .run(memoryId, userId, characterId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.post("/api/memories/pin", authMiddleware, (req, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const { characterId, memoryId, pinned } = req.body ?? {};
    ensureCharacterOwned(characterId, userId);
    db.prepare("UPDATE memories SET pinned = ? WHERE id = ? AND user_id = ? AND character_id = ?")
      .run(pinned ? 1 : 0, memoryId, userId, characterId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.post("/api/memories/update", authMiddleware, (req, res) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const { characterId, memoryId, content } = req.body ?? {};
    ensureCharacterOwned(characterId, userId);
    db.prepare("UPDATE memories SET content = ? WHERE id = ? AND user_id = ? AND character_id = ?")
      .run(safeText(content, 2000), memoryId, userId, characterId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

async function extractSummaryWithLLM(cfg, userText, assistantText) {
  const model = cfg?.llmModelLight || cfg?.llmModelChat;
  if (!cfg?.llmBaseUrl || !cfg?.llmApiKey || !model) return [];
  const system = "你是对话总结器，只返回JSON。格式：{\"summary\": string, \"importance\": number}。importance 0-1。";
  const content = `对话：\n用户：${userText}\n角色：${assistantText}\n\n请生成一条简短长期记忆总结（20-60字）。没有则返回空字符串。`;
  const res = await callOpenAICompatible({
    baseUrl: cfg.llmBaseUrl,
    apiKey: cfg.llmApiKey,
    model,
    messages: [{ role: "system", content: system }, { role: "user", content }],
    stream: false,
  });
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? "";
  try {
    const parsed = JSON.parse(String(raw));
    const summary = safeText(parsed?.summary ?? "", 300);
    const importance = Math.max(0, Math.min(1, Number(parsed?.importance ?? 0)));
    if (!summary) return [];
    return [{ content: summary, importance }];
  } catch {
    return [];
  }
}

app.get("/api/sync/meta", authMiddleware, (req, res) => {
  try {
    const userId = String(req.query.userId ?? "");
    if (!userId || userId !== req.auth.userId) return res.status(403).json({ ok: false, error: "forbidden" });
    const meta = getSyncMeta(db, userId);
    const messagesUpdatedAtBySession = meta?.messages_updated_at_json ? JSON.parse(meta.messages_updated_at_json) : {};
    res.json({
      charactersUpdatedAt: meta.characters_updated_at ?? null,
      sessionsUpdatedAt: meta.sessions_updated_at ?? null,
      messagesUpdatedAtBySession,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.get("/api/settings", authMiddleware, (req, res) => {
  try {
    const userId = String(req.query.userId ?? "");
    if (!userId || userId !== req.auth.userId) return res.status(403).json({ ok: false, error: "forbidden" });
    ensureUserPromptBricks(db, userId);
    const row = db.prepare("SELECT bricks_json FROM prompt_bricks WHERE user_id = ?").get(userId);
    const promptBricks = row?.bricks_json ? JSON.parse(row.bricks_json) : defaultPromptBricks();
    res.json({ promptBricks });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.put("/api/settings/prompt-bricks", authMiddleware, (req, res) => {
  try {
    const userId = String(req.body?.userId ?? "");
    if (!userId || userId !== req.auth.userId) return res.status(403).json({ ok: false, error: "forbidden" });
    const promptBricks = extractPromptBricks(req.body);
    db.prepare("UPDATE prompt_bricks SET bricks_json = ?, updated_at = ? WHERE user_id = ?")
      .run(JSON.stringify(promptBricks), now(), userId);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.post("/api/settings/prompt-bricks/reset", authMiddleware, (req, res) => {
  try {
    const userId = String(req.body?.userId ?? "");
    if (!userId || userId !== req.auth.userId) return res.status(403).json({ ok: false, error: "forbidden" });
    const promptBricks = defaultPromptBricks();
    db.prepare("UPDATE prompt_bricks SET bricks_json = ?, updated_at = ? WHERE user_id = ?")
      .run(JSON.stringify(promptBricks), now(), userId);
    res.json({ ok: true, promptBricks });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.get("/api/prompt-presets", authMiddleware, (req, res) => {
  try {
    const userId = String(req.query.userId ?? "");
    if (!userId || userId !== req.auth.userId) return res.status(403).json({ ok: false, error: "forbidden" });
    const rows = db.prepare("SELECT id, name, is_active, updated_at FROM prompt_presets WHERE user_id = ? ORDER BY updated_at DESC").all(userId);
    res.json({ presets: rows.map((r) => ({ id: r.id, name: r.name, isActive: Boolean(r.is_active), updatedAt: r.updated_at })) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.get("/api/prompt-presets/:id", authMiddleware, (req, res) => {
  try {
    const userId = String(req.query.userId ?? "");
    if (!userId || userId !== req.auth.userId) return res.status(403).json({ ok: false, error: "forbidden" });
    const row = db.prepare("SELECT * FROM prompt_presets WHERE id = ? AND user_id = ?").get(req.params.id, userId);
    if (!row) return res.status(404).json({ error: "not_found" });
    const bricks = row.bricks_json ? JSON.parse(row.bricks_json) : defaultPromptBricks();
    res.json({ id: row.id, name: row.name, bricks, isActive: Boolean(row.is_active) });
  } catch (e) {
    res.status(500).json({ error: String(e?.message ?? e) });
  }
});

app.post("/api/prompt-presets", authMiddleware, (req, res) => {
  try {
    const userId = String(req.body?.userId ?? "");
    if (!userId || userId !== req.auth.userId) return res.status(403).json({ ok: false, error: "forbidden" });
    const name = safeText(req.body?.name ?? "", 64).trim();
    const bricks = extractPromptBricks(req.body).bricks;
    const id = randomUUID();
    const setActive = Boolean(req.body?.setActive);
    const payload = { version: 1, bricks };
    if (setActive) db.prepare("UPDATE prompt_presets SET is_active = 0 WHERE user_id = ?").run(userId);
    db.prepare("INSERT INTO prompt_presets (id, user_id, name, bricks_json, is_active, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, userId, name || "新预设", JSON.stringify(payload), setActive ? 1 : 0, now());
    if (setActive) {
      db.prepare("UPDATE prompt_bricks SET bricks_json = ?, updated_at = ? WHERE user_id = ?")
        .run(JSON.stringify(payload), now(), userId);
    }
    res.json({ ok: true, id });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.put("/api/prompt-presets/:id", authMiddleware, (req, res) => {
  try {
    const userId = String(req.body?.userId ?? "");
    if (!userId || userId !== req.auth.userId) return res.status(403).json({ ok: false, error: "forbidden" });
    const name = safeText(req.body?.name ?? "", 64).trim();
    const bricks = extractPromptBricks(req.body);
    const applyNow = Boolean(req.body?.applyNow);
    if (applyNow) db.prepare("UPDATE prompt_presets SET is_active = 0 WHERE user_id = ?").run(userId);
    db.prepare("UPDATE prompt_presets SET name = ?, bricks_json = ?, is_active = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .run(name || "预设", JSON.stringify(bricks), applyNow ? 1 : 0, now(), req.params.id, userId);
    if (applyNow) {
      db.prepare("UPDATE prompt_bricks SET bricks_json = ?, updated_at = ? WHERE user_id = ?")
        .run(JSON.stringify(bricks), now(), userId);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.delete("/api/prompt-presets/:id", authMiddleware, (req, res) => {
  try {
    const userId = String(req.body?.userId ?? "");
    if (!userId || userId !== req.auth.userId) return res.status(403).json({ ok: false, error: "forbidden" });
    db.prepare("DELETE FROM prompt_presets WHERE id = ? AND user_id = ?").run(req.params.id, userId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.post("/api/prompt-presets/:id/activate", authMiddleware, (req, res) => {
  try {
    const userId = String(req.body?.userId ?? "");
    if (!userId || userId !== req.auth.userId) return res.status(403).json({ ok: false, error: "forbidden" });
    db.prepare("UPDATE prompt_presets SET is_active = 0 WHERE user_id = ?").run(userId);
    db.prepare("UPDATE prompt_presets SET is_active = 1, updated_at = ? WHERE id = ? AND user_id = ?")
      .run(now(), req.params.id, userId);
    const row = db.prepare("SELECT bricks_json FROM prompt_presets WHERE id = ? AND user_id = ?").get(req.params.id, userId);
    if (row?.bricks_json) {
      db.prepare("UPDATE prompt_bricks SET bricks_json = ?, updated_at = ? WHERE user_id = ?")
        .run(row.bricks_json, now(), userId);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.put("/api/settings/llm", authMiddleware, (req, res) => {
  try {
    const userId = String(req.body?.userId ?? "");
    if (!userId || userId !== req.auth.userId) return res.status(403).json({ ok: false, error: "forbidden" });
    const llm = req.body?.llm ?? {};
    const baseUrl = safeText(llm?.baseUrl ?? "", 512).trim();
    const apiKey = safeText(llm?.apiKey ?? "", 512).trim();
    const modelChat = safeText(llm?.modelChat ?? "", 128).trim();
    const modelLight = safeText(llm?.modelLight ?? "", 128).trim();
    const encKey = apiKey ? encryptSecret(apiKey) : "";
    if (apiKey && !encKey) return res.status(400).json({ ok: false, error: "LLM_SETTINGS_KEY_missing" });
    const row = db.prepare("SELECT user_id FROM llm_settings WHERE user_id = ?").get(userId);
    if (row) {
      db.prepare("UPDATE llm_settings SET llm_base_url = ?, llm_api_key_enc = ?, llm_model_chat = ?, llm_model_light = ?, updated_at = ? WHERE user_id = ?")
        .run(baseUrl, encKey, modelChat, modelLight, now(), userId);
    } else {
      db.prepare("INSERT INTO llm_settings (user_id, llm_base_url, llm_api_key_enc, llm_model_chat, llm_model_light, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(userId, baseUrl, encKey, modelChat, modelLight, now());
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.post("/api/uploads/avatar", authMiddleware, upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "file_missing" });
    const ext = path.extname(req.file.originalname || "").toLowerCase() || ".png";
    const filename = `${randomUUID()}${ext}`;
    const dest = path.join(AVATAR_DIR, filename);
    fs.renameSync(req.file.path, dest);
    res.json({ url: `/uploads/avatars/${filename}` });
  } catch (e) {
    res.status(500).json({ error: String(e?.message ?? e) });
  }
});

app.post("/api/uploads/character-avatar", authMiddleware, upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "file_missing" });
    const ext = path.extname(req.file.originalname || "").toLowerCase() || ".png";
    const filename = `${randomUUID()}${ext}`;
    const dest = path.join(CHARACTER_AVATAR_DIR, filename);
    fs.renameSync(req.file.path, dest);
    res.json({ url: `/uploads/character-avatars/${filename}` });
  } catch (e) {
    res.status(500).json({ error: String(e?.message ?? e) });
  }
});

app.use("/uploads", express.static(UPLOAD_DIR));

app.get("/api/moments/posts", authMiddleware, (req, res) => {
  try {
    const userId = String(req.query.userId ?? "");
    if (!userId || userId !== req.auth.userId) return res.status(403).json({ ok: false, error: "forbidden" });
    const limit = Math.min(Number(req.query.limit ?? 20) || 20, 50);
    const rows = db.prepare("SELECT * FROM moments_posts ORDER BY created_at DESC LIMIT ?").all(limit);
    const posts = rows.map((p) => {
      const user = db.prepare("SELECT id, display_name, avatar_url FROM users WHERE id = ?").get(p.user_id);
      const comments = db.prepare("SELECT * FROM moments_comments WHERE post_id = ? ORDER BY created_at ASC").all(p.id);
      const likes = db.prepare("SELECT * FROM moments_likes WHERE post_id = ? ORDER BY created_at ASC").all(p.id);
      const likeUsers = likes.map((l) => db.prepare("SELECT display_name FROM users WHERE id = ?").get(l.user_id));
      return {
        id: p.id,
        user: { id: user?.id ?? p.user_id, name: user?.display_name ?? "用户", avatarUrl: user?.avatar_url ?? "" },
        content: p.content,
        media: p.media_json ? JSON.parse(p.media_json) : [],
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        likes: likeUsers.map((u, idx) => u?.display_name ?? likes[idx]?.user_id ?? "用户"),
        likedByMe: likes.some((l) => l.user_id === userId),
        comments: comments.map((c) => {
          const u = db.prepare("SELECT display_name, avatar_url FROM users WHERE id = ?").get(c.user_id);
          return {
            id: c.id,
            userId: c.user_id,
            userName: u?.display_name ?? "用户",
            userAvatarUrl: u?.avatar_url ?? "",
            content: c.content,
            createdAt: c.created_at,
          };
        }),
      };
    });
    res.json({ posts, nextCursor: null });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.post("/api/moments/posts", authMiddleware, (req, res) => {
  try {
    const userId = String(req.body?.userId ?? "");
    if (!userId || userId !== req.auth.userId) return res.status(403).json({ ok: false, error: "forbidden" });
    const content = safeText(req.body?.content ?? "", 4000);
    const media = req.body?.media ?? [];
    const id = randomUUID();
    const createdAt = now();
    db.prepare("INSERT INTO moments_posts (id, user_id, content, media_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, userId, content, JSON.stringify(media), createdAt, createdAt);
    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.post("/api/moments/comments", authMiddleware, (req, res) => {
  try {
    const userId = String(req.body?.userId ?? "");
    if (!userId || userId !== req.auth.userId) return res.status(403).json({ ok: false, error: "forbidden" });
    const postId = String(req.body?.postId ?? "");
    const content = safeText(req.body?.content ?? "", 1000);
    if (!postId || !content) return res.status(400).json({ ok: false, error: "invalid_params" });
    const id = randomUUID();
    db.prepare("INSERT INTO moments_comments (id, post_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, postId, userId, content, now());
    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.post("/api/moments/like", authMiddleware, (req, res) => {
  try {
    const userId = String(req.body?.userId ?? "");
    if (!userId || userId !== req.auth.userId) return res.status(403).json({ ok: false, error: "forbidden" });
    const postId = String(req.body?.postId ?? "");
    const liked = Boolean(req.body?.liked);
    if (!postId) return res.status(400).json({ ok: false, error: "invalid_params" });
    if (liked) {
      db.prepare("INSERT OR IGNORE INTO moments_likes (id, post_id, user_id, created_at) VALUES (?, ?, ?, ?)")
        .run(randomUUID(), postId, userId, now());
    } else {
      db.prepare("DELETE FROM moments_likes WHERE post_id = ? AND user_id = ?").run(postId, userId);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.get("/api/preferences/character", authMiddleware, (req, res) => {
  try {
    const userId = String(req.query.userId ?? "");
    const characterId = String(req.query.characterId ?? "");
    if (!userId || userId !== req.auth.userId) return res.status(403).json({ ok: false, error: "forbidden" });
    ensureCharacterOwned(characterId, userId);
    const row = db.prepare("SELECT nickname FROM preferences_character WHERE user_id = ? AND character_id = ?").get(userId, characterId);
    res.json({ nickname: row?.nickname ?? "" });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.patch("/api/preferences/character", authMiddleware, (req, res) => {
  try {
    const userId = String(req.body?.userId ?? "");
    const characterId = String(req.body?.characterId ?? "");
    if (!userId || userId !== req.auth.userId) return res.status(403).json({ ok: false, error: "forbidden" });
    ensureCharacterOwned(characterId, userId);
    const nickname = safeText(req.body?.nickname ?? "", 32);
    db.prepare("INSERT INTO preferences_character (id, user_id, character_id, nickname, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(randomUUID(), userId, characterId, nickname, now());
    db.prepare("UPDATE preferences_character SET nickname = ?, updated_at = ? WHERE user_id = ? AND character_id = ?")
      .run(nickname, now(), userId, characterId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.get("/api/admin/invite-codes", authMiddleware, adminOnly, (req, res) => {
  try {
    const rows = db.prepare("SELECT code, created_at, used_at FROM invites ORDER BY created_at DESC LIMIT 200").all();
    res.json({ ok: true, codes: rows.map((r) => ({ code: r.code, createdAt: r.created_at, usedAt: r.used_at ?? null })) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.post("/api/admin/invite-codes", authMiddleware, adminOnly, (req, res) => {
  try {
    const count = Math.min(Math.max(Number(req.body?.count ?? 1), 1), 50);
    const codes = [];
    const createdAt = now();
    const insert = db.prepare("INSERT INTO invites (code, created_at) VALUES (?, ?)");
    for (let i = 0; i < count; i += 1) {
      const code = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
      insert.run(code, createdAt);
      codes.push(code);
    }
    res.json({ ok: true, codes, createdAt });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.get("/api/admin/users", authMiddleware, adminOnly, (req, res) => {
  try {
    const rows = db.prepare("SELECT accounts.id as account_id, accounts.username, accounts.role, accounts.created_at, users.id as user_id FROM accounts LEFT JOIN users ON users.account_id = accounts.id ORDER BY accounts.created_at DESC").all();
    res.json({
      ok: true,
      users: rows.map((r) => ({
        accountId: r.account_id,
        userId: r.user_id,
        username: r.username,
        role: r.role === "admin" ? "admin" : "user",
        createdAt: r.created_at,
      })),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.get("/api/admin/users/:userId/sessions", authMiddleware, adminOnly, (req, res) => {
  try {
    const userId = req.params.userId;
    const rows = db.prepare("SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC").all(userId);
    const sessions = rows.map((s) => {
      const character = db.prepare("SELECT name FROM characters WHERE id = ?").get(s.character_id);
      return {
        id: s.id,
        userId: s.user_id,
        characterId: s.character_id,
        characterName: character?.name ?? "角色",
        createdAt: s.created_at,
      };
    });
    res.json({ ok: true, sessions });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.get("/api/admin/sessions/:sessionId/messages", authMiddleware, adminOnly, (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const rows = db.prepare("SELECT id, role, content, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC").all(sessionId);
    res.json({ ok: true, messages: rows.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.created_at })) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.post("/api/admin/users/:accountId/password", authMiddleware, adminOnly, (req, res) => {
  try {
    const accountId = req.params.accountId;
    const newPassword = String(req.body?.newPassword ?? "");
    if (!newPassword) return res.status(400).json({ ok: false, error: "invalid_params" });
    db.prepare("UPDATE accounts SET password_hash = ? WHERE id = ?").run(hashPassword(newPassword), accountId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.get("/api/admin/affection/stages", authMiddleware, adminOnly, (req, res) => {
  try {
    const rows = db.prepare("SELECT key, label, min_score, nsfw, prompt FROM affection_stages ORDER BY min_score ASC").all();
    res.json({ ok: true, stages: rows.map((s) => ({ key: s.key, label: s.label, minScore: s.min_score, nsfw: s.nsfw, prompt: s.prompt })) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.put("/api/admin/affection/stages", authMiddleware, adminOnly, (req, res) => {
  try {
    const stages = Array.isArray(req.body?.stages) ? req.body.stages : [];
    if (!stages.length) return res.status(400).json({ ok: false, error: "invalid_params" });
    db.prepare("DELETE FROM affection_stages").run();
    const insert = db.prepare("INSERT INTO affection_stages (id, key, label, min_score, nsfw, prompt) VALUES (?, ?, ?, ?, ?, ?)");
    for (const s of stages) {
      insert.run(randomUUID(), String(s.key), String(s.label), Number(s.minScore ?? 0), String(s.nsfw ?? "none"), String(s.prompt ?? ""));
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.get("/api/admin/affection/tuning", authMiddleware, adminOnly, (req, res) => {
  try {
    const row = db.prepare("SELECT tuning_json FROM affection_tuning LIMIT 1").get();
    res.json({ ok: true, tuning: row?.tuning_json ? JSON.parse(row.tuning_json) : null });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.put("/api/admin/affection/tuning", authMiddleware, adminOnly, (req, res) => {
  try {
    const tuning = req.body?.tuning ?? null;
    if (!tuning) return res.status(400).json({ ok: false, error: "invalid_params" });
    const row = db.prepare("SELECT id FROM affection_tuning LIMIT 1").get();
    const payload = {
      initScore: Number(tuning.initScore ?? 20),
      clampMin: Number(tuning.clampMin ?? -8),
      clampMax: Number(tuning.clampMax ?? 6),
      hourlyCapPos: Number(tuning.hourlyCapPos ?? 8),
      hourlyCapNeg: Number(tuning.hourlyCapNeg ?? 12),
      scoreMin: Number(tuning.scoreMin ?? 0),
      scoreMax: Number(tuning.scoreMax ?? 100),
      ruleWeights: tuning.ruleWeights ?? {},
    };
    if (!row) {
      db.prepare("INSERT INTO affection_tuning (id, tuning_json, updated_at) VALUES (?, ?, ?)").run(randomUUID(), JSON.stringify(payload), now());
    } else {
      db.prepare("UPDATE affection_tuning SET tuning_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(payload), now(), row.id);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.listen(PORT, () => {
  console.log(`[lingxi] server running at http://localhost:${PORT}`);
});
