
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar } from "../ui/Avatar";
import { StitchIcon } from "../ui/stitch/StitchIcon";
import { apiGetCharacter, apiGetCharacterPreference, apiGetMe, apiGetMessages, apiGetMessagesSince, apiGetState, apiListSessions, apiListSessionsSince, apiSyncMeta, apiStreamChat, assetUrl, loadApiConfig } from "../lib/api";
import { AffectionNicknameCard } from "../ui/AffectionNicknameCard";

type UiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  // 仅用于“错误时重试”：记住该条 assistant 回复对应的 user 输入
  requestText?: string;
  requestAt?: string;
  pending?: boolean;
  error?: boolean;
  kind?: "text" | "typing";
};

type MessageCache = {
  messages: UiMessage[];
  lastSyncAt?: string | null;
};

const MESSAGES_CACHE_KEY = "lx:cache:v1:messages";
const MESSAGE_CACHE_LIMIT = 500;

function loadMessageCache(userId: string | null | undefined, sessionId: string): MessageCache | null {
  try {
    if (!userId) return null;
    const raw = localStorage.getItem(`${MESSAGES_CACHE_KEY}:${userId}:${sessionId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MessageCache;
    if (!parsed || !Array.isArray(parsed.messages)) return null;
    return { messages: parsed.messages, lastSyncAt: parsed.lastSyncAt ?? null };
  } catch {
    return null;
  }
}

function saveMessageCache(userId: string | null | undefined, sessionId: string, next: MessageCache) {
  try {
    if (!userId) return;
    localStorage.setItem(`${MESSAGES_CACHE_KEY}:${userId}:${sessionId}`, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function formatTime(ts?: string) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-150ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-75ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" />
    </span>
  );
}

function shouldShowAvatar(curr: UiMessage, prev?: UiMessage) {
  if (!prev) return true;
  if (prev.role !== curr.role) return true;
  return false;
}

function normalizeAssistantText(s: string) {
  return (s || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trimEnd();
}

function Bubble({
  m,
  showAvatar,
  myAvatarUrl,
  characterAvatarUrl,
  onRetry,
}: {
  m: UiMessage;
  showAvatar: boolean;
  myAvatarUrl: string;
  characterAvatarUrl: string;
  onRetry?: (m: UiMessage) => void;
}) {
  const isMe = m.role === "user";
  const text = isMe ? m.content : normalizeAssistantText(m.content);

  // Pink macOS Design:
  // Me: Gradient Pink, White Text, soft shadow.
  // Assistant: Pure White, Dark Text, subtle border/shadow.
  const bubbleClass = isMe
    ? "bg-pink text-white shadow-md border-none rounded-2xl"
    : m.error
      ? "bg-red-50 text-red-900 border border-red-200 rounded-2xl"
      : "bg-white text-text shadow-sm border border-gray-100 rounded-2xl";

  const avatarEl = (() => {
    // Spacer for alignment if avatar is hidden but structure is needed
    // However, for a cleaner look, we might just not render it or render a transparent one.
    // Here we stick to rendering it for layout consistency.
    const sizeClass = "w-9 h-9";

    if (!showAvatar) return <div className={sizeClass} />;

    const imgClass = "h-full w-full object-cover";
    const containerClass = `${sizeClass} rounded-full border border-white/40 bg-gray-100 shadow-sm overflow-hidden shrink-0`;

    if (isMe && myAvatarUrl) {
      return (
        <div className={containerClass}>
          <img alt="我" src={myAvatarUrl} className={imgClass} />
        </div>
      );
    }
    if (!isMe && characterAvatarUrl) {
      return (
        <div className={containerClass}>
          <img alt="TA" src={characterAvatarUrl} className={imgClass} />
        </div>
      );
    }
    return (
      <div className={`${containerClass} flex items-center justify-center`}>
        <Avatar size={34} />
      </div>
    );
  })();

  return (
    <div className={`flex w-full ${isMe ? "justify-end" : "justify-start"} animate-fade-in-up`}>
      <div className={`flex max-w-[85%] gap-3 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
        {/* Avatar */}
        <div className="flex flex-col justify-end pb-1">
          {avatarEl}
        </div>

        {/* Content */}
        <div className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
          {/* Name/Time (Optional, maybe on hover or just removed for cleanliness) */}

          <div className="relative group">
            <div
              className={`
                px-4 py-2.5 text-[15px] leading-relaxed relative z-10 break-words
                ${bubbleClass}
              `}
            >
              {m.kind === "typing" ? <TypingDots /> : text || (m.pending ? "…" : "")}
            </div>

            {/* Timestamp on hover */}
            {m.kind !== "typing" && (
              <div className={`
                 absolute top-full mt-1 text-[10px] text-muted/60 whitespace-nowrap select-none 
                 opacity-0 group-hover:opacity-100 transition-opacity duration-200
                 ${isMe ? "right-0" : "left-0"}
               `}>
                {formatTime(m.createdAt)}
              </div>
            )}
          </div>

          {/* Error / Retry */}
          {!isMe && m.error && m.kind !== "typing" && m.requestText ? (
            <div className="mt-1 flex items-center gap-2">
              <button
                className="text-xs text-red-400 hover:text-red-500 underline underline-offset-2"
                onClick={() => onRetry?.(m)}
              >
                Retry
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function shouldShowTimeDivider(curr?: UiMessage, prev?: UiMessage) {
  if (!curr?.createdAt) return false;
  if (!prev?.createdAt) return true;
  const a = new Date(prev.createdAt).getTime();
  const b = new Date(curr.createdAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return b - a > 5 * 60 * 1000;
}

function mergeServerMessages(prev: UiMessage[], serverMessages: Array<{ id: string; role: "user" | "assistant"; content: string; createdAt: string }>) {
  const map = new Map(prev.map((m) => [m.id, m]));
  for (const m of serverMessages) {
    map.set(m.id, { id: m.id, role: m.role, content: m.content, createdAt: m.createdAt, kind: "text" as const, pending: false, error: false });
  }
  const sortTime = (m: UiMessage) => {
    if (!m.createdAt) return Number.POSITIVE_INFINITY;
    const t = new Date(m.createdAt).getTime();
    return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
  };
  const merged = Array.from(map.values()).sort((a, b) => {
    const ta = sortTime(a);
    const tb = sortTime(b);
    return ta - tb;
  });
  return merged.slice(-MESSAGE_CACHE_LIMIT);
}

export function ChatPane(props: { sessionId: string; embedded?: boolean }) {
  const { sessionId, embedded } = props;
  const navigate = useNavigate();
  const cfg = useMemo(() => loadApiConfig(), []);
  const cachedMessages = useMemo(() => loadMessageCache(cfg?.userId ?? null, sessionId), [cfg?.userId, sessionId]);
  const [myAvatarUrl, setMyAvatarUrl] = useState<string>("");
  const [characterAvatarUrl, setCharacterAvatarUrl] = useState<string>("");

  const [sessions, setSessions] = useState<Array<{ id: string; characterId: string; characterName: string }>>([]);
  const active = useMemo(() => sessions.find((s) => s.id === sessionId) ?? null, [sessions, sessionId]);
  const characterId = active?.characterId ?? "";
  const title = active?.characterName ?? "聊天";

  const [presence, setPresence] = useState<"online" | "busy" | "offline">("online");
  type ChatAffection = { stage: string; score: number; petName: string | null; updatedAt: string | null };
  type ChatState = { affection: ChatAffection | null; memories: unknown[]; affectionStages?: Array<{ key: string; label: string; minScore: number; nsfw: "none" | "light" | "normal" | "full" }> };
  const [state, setState] = useState<ChatState | null>(null);
  const [affectionStages, setAffectionStages] = useState<Array<{ key: string; label: string; minScore: number; nsfw: "none" | "light" | "normal" | "full" }>>([]);
  const [nickname, setNickname] = useState<string>("");
  const [hideNicknameCard, setHideNicknameCard] = useState(false);
  const [messages, setMessages] = useState<UiMessage[]>(() => cachedMessages?.messages ?? []);
  const [messagesSyncAt, setMessagesSyncAt] = useState<string | null>(() => cachedMessages?.lastSyncAt ?? null);
  const [messagesRefreshing, setMessagesRefreshing] = useState<boolean>(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | "plus" | "emoji">(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [affectionOpen, setAffectionOpen] = useState(false);

  function scrollToBottom(behavior: ScrollBehavior = "auto") {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior });
    });
  }

  useEffect(() => {
    const cached = loadMessageCache(cfg?.userId ?? null, sessionId);
    setMessages(cached?.messages ?? []);
    setMessagesSyncAt(cached?.lastSyncAt ?? null);
    setError(null);
    setMessagesRefreshing(false);
  }, [cfg?.userId, sessionId]);

  useEffect(() => {
    setPresence(busy ? "busy" : "online");
  }, [busy]);

  useEffect(() => {
    if (!cfg) return;
    (async () => {
      try {
        const meta = await apiSyncMeta(cfg);
        const remoteUpdatedAt = meta.sessionsUpdatedAt;
        if (!remoteUpdatedAt || !messagesSyncAt || remoteUpdatedAt > messagesSyncAt) {
          const data = messagesSyncAt ? await apiListSessionsSince(cfg, messagesSyncAt) : await apiListSessions(cfg);
          if (data.sessions?.length) {
            setSessions(data.sessions.map((s) => ({ id: s.id, characterId: s.characterId, characterName: s.characterName })));
          }
        } else if (sessions.length === 0) {
          const data = await apiListSessions(cfg);
          setSessions(data.sessions.map((s) => ({ id: s.id, characterId: s.characterId, characterName: s.characterName })));
        }
      } catch {
        // ignore
      }
    })();
  }, [cfg, messagesSyncAt, sessions.length]);

  useEffect(() => {
    if (!cfg) return;
    (async () => {
      try {
        const me = await apiGetMe(cfg);
        const url = me.avatarUrl ? assetUrl(cfg.baseUrl, me.avatarUrl) : "";
        setMyAvatarUrl(url);
      } catch {
        // ignore
      }
    })();
  }, [cfg]);

  useEffect(() => {
    if (!cfg || !characterId) return;
    (async () => {
      try {
        const ch = await apiGetCharacter(cfg, characterId);
        const url = ch.avatarUrl ? assetUrl(cfg.baseUrl, ch.avatarUrl) : "";
        setCharacterAvatarUrl(url);
      } catch {
        // ignore
      }
    })();
  }, [cfg, characterId]);

  useEffect(() => {
    if (!cfg || !sessionId) return;
    (async () => {
      setError(null);
      setMessagesRefreshing(true);
      try {
        const meta = await apiSyncMeta(cfg);
        const remoteUpdatedAt = meta.messagesUpdatedAtBySession?.[sessionId] ?? null;
        if (!messagesSyncAt || (remoteUpdatedAt && remoteUpdatedAt > messagesSyncAt)) {
          const data = messagesSyncAt
            ? await apiGetMessagesSince(cfg, sessionId, messagesSyncAt)
            : await apiGetMessages(cfg, sessionId);
          if (data.messages?.length) {
            setMessages((prev) => mergeServerMessages(prev, data.messages));
          }
          const nextSync = remoteUpdatedAt ?? new Date().toISOString();
          setMessagesSyncAt(nextSync);
        } else if (messages.length === 0) {
          const data = await apiGetMessages(cfg, sessionId);
          setMessages((prev) => mergeServerMessages(prev, data.messages));
          const nextSync = remoteUpdatedAt ?? new Date().toISOString();
          setMessagesSyncAt(nextSync);
        }
      } catch (e: unknown) {
        const err = e as { message?: unknown };
        setError(String(err?.message ?? e));
      } finally {
        setMessagesRefreshing(false);
      }
    })();
  }, [cfg, sessionId, messagesSyncAt]);

  useEffect(() => {
    if (!scrollRef.current) return;
    if (isAtBottom) scrollToBottom("auto");
  }, [messages, isAtBottom, busy]);

  useEffect(() => {
    // 过滤掉临时消息（ID以 u_ 或 t_ 开头），只保存服务端确认的消息
    const persistableMessages = messages.filter((m) => !m.id.startsWith("u_") && !m.id.startsWith("t_"));
    saveMessageCache(cfg?.userId ?? null, sessionId, { messages: persistableMessages, lastSyncAt: messagesSyncAt });
  }, [cfg?.userId, sessionId, messages, messagesSyncAt]);

  useEffect(() => {
    if (!cfg || !characterId) return;
    (async () => {
      try {
        const s = await apiGetState(cfg, { characterId, sessionId });
        setState(s);
        if (s.affectionStages && s.affectionStages.length) {
          setAffectionStages(s.affectionStages);
        }
      } catch {
        // ignore
      }
    })();
  }, [cfg, characterId, sessionId, busy]);

  useEffect(() => {
    if (!cfg || !characterId) return;
    (async () => {
      try {
        const p = await apiGetCharacterPreference(cfg, characterId);
        setNickname(p.nickname || "");
      } catch {
        // ignore
      }
    })();
  }, [cfg, characterId, sessionId]);

  async function refreshState() {
    if (!cfg || !characterId) return;
    const s = await apiGetState(cfg, { characterId, sessionId });
    setState(s);
    if (s.affectionStages && s.affectionStages.length) {
      setAffectionStages(s.affectionStages);
    }
  }

  function onComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter") return;
    if (e.shiftKey) return;
    e.preventDefault();
    void send();
  }

  function closePanels() {
    setPanel(null);
  }

  // 兼容旧交互：面板目前保留，但“发送”按钮始终显示；如后续要恢复“+”按钮再启用此函数

  function toggleEmoji() {
    setPanel((p) => (p === "emoji" ? null : "emoji"));
  }

  async function send(overrideText?: string) {
    if (!cfg || !sessionId) return;
    const text = (overrideText ?? draft).trim();
    if (!text) return;
    if (!characterId) {
      setError("缺少 characterId（请返回消息列表重新进入）");
      return;
    }

    setBusy(true);
    setError(null);
    if (!overrideText) setDraft("");
    closePanels();

    const reqAt = new Date().toISOString();
    const userMsgId = `u_${Date.now()}`;
    const userMsg: UiMessage = { id: userMsgId, role: "user", content: text, createdAt: reqAt, kind: "text" };
    const typingId = `t_${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: typingId, role: "assistant", content: "", createdAt: "", kind: "typing", pending: true, requestText: text, requestAt: reqAt },
    ]);
    setIsAtBottom(true);
    scrollToBottom("smooth");

    try {
      await new Promise((r) => setTimeout(r, 220));
      await apiStreamChat({
        cfg,
        sessionId,
        characterId,
        message: text,
        onToken: (t) => {
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === typingId);
            if (idx === -1) return prev;
            const cur = prev[idx];
            const next = [...prev];
            const firstTokenAt = cur.createdAt || new Date().toISOString();
            next[idx] = {
              ...cur,
              kind: "text",
              pending: false,
              createdAt: firstTokenAt,
              content: (cur.content || "") + t,
            };
            return next;
          });
          if (isAtBottom) scrollToBottom("auto");
        },
      });
      try {
        // 时间回退1秒，确保能获取到刚发送的消息（避免客户端/服务端时间差问题）
        const sinceSafe = new Date(new Date(reqAt).getTime() - 1000).toISOString();
        const data = await apiGetMessagesSince(cfg, sessionId, sinceSafe);
        if (data.messages?.length) {
          // 检查服务端是否返回了用户消息和AI消息
          const hasUserMsg = data.messages.some((m) => m.role === "user");
          const hasAssistantMsg = data.messages.some((m) => m.role === "assistant");

          setMessages((prev) => {
            // 只有当服务端返回了对应类型的消息时，才删除临时消息
            const filtered = prev.filter((m) => {
              if (m.id === userMsgId && hasUserMsg) return false;
              if (m.id === typingId && hasAssistantMsg) return false;
              return true;
            });
            return mergeServerMessages(filtered, data.messages);
          });
          if (isAtBottom) scrollToBottom("auto");
        }
        // 如果服务端没返回消息，保留所有临时消息（用户消息和流式响应内容）
      } catch {
        // 请求失败时保留所有临时消息
      }
      await refreshState();
    } catch (e: unknown) {
      const err = e as { message?: unknown };
      const msg = String(err?.message ?? e);
      setError(msg.includes("session_busy") || msg.includes("HTTP 409") ? "对方还在回复上一条，等一下再发～" : msg);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === typingId
            ? {
              ...m,
              kind: "text",
              pending: false,
              error: true,
              // 如果已经拿到部分 token，不要覆盖成“发送失败”；保留已收到的内容并标记为可能不完整
              content: m.content ? `${m.content} \n\n（流式连接中断，内容可能不完整）` : "发送失败，请稍后重试。",
            }
            : m,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function retryAssistant(m: UiMessage) {
    if (!m.requestText) return;
    // 重试时不复用旧的错误气泡，直接再发起一次请求（仍遵循 session_lock）
    await send(m.requestText);
  }

  return (
    <div className="h-[100dvh] md:h-full flex flex-col relative bg-transparent">
      {/* Background Enhancements (Optional, if needed on top of shell) */}

      {/* Header */}
      <header className="shrink-0 h-16 flex items-center justify-between px-4 md:px-6 bg-white/90 backdrop-blur-md border-b border-black/5 z-20 sticky top-0">
        <div className="flex items-center gap-4">
          {!embedded && (
            <button
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-muted hover:bg-surface-3 transition-colors"
              onClick={() => navigate("/messages")}
            >
              <StitchIcon name="arrow_back_ios_new" className="text-[16px] pr-0.5" />
            </button>
          )}

          <div className="flex flex-col">
            <div className="text-[15px] font-bold text-text tracking-wide">{title}</div>
            <div className="flex items-center gap-1.5 opacity-80">
              <span className={`w-2 h-2 rounded-full ring-2 ring-white/50 ${presence === "busy" ? "bg-amber-400" : presence === "online" ? "bg-green-400" : "bg-gray-300"}`} />
              <span className="text-[10px] text-muted font-medium">
                {presence === "busy" ? "忙碌" : presence === "online" ? "在线" : "离线"}
                {state?.affection?.stage ? (() => {
                  const found = affectionStages.find((s) => s.key === state.affection?.stage);
                  return ` · ${found?.label ?? state.affection.stage}`;
                })() : ""}
              </span>
              {messagesRefreshing ? <span className="text-[10px] text-muted/60">更新中…</span> : null}
            </div>
          </div>
        </div>

        <button
          className="w-9 h-9 rounded-full overflow-hidden border border-white/40 shadow-sm bg-white/70 hover:bg-white transition"
          aria-label="好感度"
          onClick={() => setAffectionOpen(true)}
        >
          {characterAvatarUrl ? (
            <img src={characterAvatarUrl} alt="角色头像" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-muted">
              <StitchIcon name="favorite" className="text-[18px]" />
            </div>
          )}
        </button>
      </header>

      {/* Message List */}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
          setIsAtBottom(distance < 40);
        }}
        className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-6 scroll-smooth pb-36 md:pb-8"
      >
        {error ? (
          <div className="mx-auto mb-6 w-fit rounded-full border border-red-200/50 bg-red-50/80 backdrop-blur-md px-4 py-1.5 text-xs text-red-500 shadow-sm animate-fade-in-up">
            {error}
          </div>
        ) : null}

        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-muted/40 pb-20">
            <div className="w-20 h-20 rounded-3xl bg-surface-2/50 flex items-center justify-center">
              <StitchIcon name="chat_bubble_outline" className="text-[32px] opacity-60" />
            </div>
            <span className="text-sm font-medium">暂无消息</span>
          </div>
        ) : (
          <div className="space-y-6">
            {!hideNicknameCard && cfg && state?.affection && state.affection.score >= 40 && !nickname && characterId ? (
              <AffectionNicknameCard
                cfg={cfg}
                characterId={characterId}
                onSaved={(n) => {
                  setNickname(n);
                  setHideNicknameCard(true);
                }}
              />
            ) : null}
            {messages.map((m, idx) => (
              <div key={m.id} className="space-y-2">
                {shouldShowTimeDivider(m, idx > 0 ? messages[idx - 1] : undefined) ? (
                  <div className="flex justify-center py-2">
                    <span className="text-[10px] font-semibold text-muted/40 tracking-wider uppercase">
                      {formatTime(m.createdAt)}
                    </span>
                  </div>
                ) : null}
                <Bubble
                  m={m}
                  showAvatar={shouldShowAvatar(m, idx > 0 ? messages[idx - 1] : undefined)}
                  myAvatarUrl={myAvatarUrl}
                  characterAvatarUrl={characterAvatarUrl}
                  onRetry={(mm) => void retryAssistant(mm)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {affectionOpen && (
        <div className="fixed inset-0 z-[120]">
          <button
            className="absolute inset-0 bg-black/20"
            onClick={() => setAffectionOpen(false)}
            aria-label="关闭"
          />
          <div className="absolute left-1/2 top-24 -translate-x-1/2 w-[320px] rounded-2xl bg-white/95 backdrop-blur-xl border border-white/40 shadow-xl p-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden border border-white/40 bg-surface-2">
                {characterAvatarUrl ? (
                  <img src={characterAvatarUrl} alt="角色头像" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted text-xs">TA</div>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-text">{title}</div>
                <div className="text-xs text-muted">
                  当前阶段：{state?.affection?.stage ?? "stranger"}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-muted mb-1">
                <span>好感度</span>
                <span>{Math.round(state?.affection?.score ?? 0)}/100</span>
              </div>
              <div className="h-2 rounded-full bg-black/5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cta to-pink"
                  style={{ width: `${Math.max(0, Math.min(100, Math.round(state?.affection?.score ?? 0)))}%` }}
                />
              </div>
            </div>

            {affectionStages.length > 0 && (
              <div className="mt-4 space-y-2 text-xs text-muted/80">
                {affectionStages
                  .slice()
                  .sort((a, b) => a.minScore - b.minScore)
                  .map((s) => (
                    <div key={s.key} className="flex items-center justify-between">
                      <span>{s.label}</span>
                      <span>≥ {s.minScore}</span>
                    </div>
                  ))}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                className="px-4 py-1.5 rounded-full text-xs font-medium bg-black/5 text-text hover:bg-black/10 transition"
                onClick={() => setAffectionOpen(false)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="shrink-0 px-4 md:px-6 pb-4 relative">
        <div className="flex items-end gap-2 rounded-3xl bg-white/90 backdrop-blur-md border border-white/40 shadow-sm px-3 py-2">
          <button
            className={`h-9 w-9 rounded-full flex items-center justify-center transition ${panel === "emoji" ? "bg-pink/10 text-pink" : "bg-surface-2 text-muted hover:bg-surface-3"}`}
            onClick={toggleEmoji}
            aria-label="表情"
          >
            <StitchIcon name="sentiment_satisfied" className="text-[22px]" />
          </button>

          <div className="flex-1 py-1.5">
            <textarea
              className="w-full max-h-[120px] min-h-[40px] px-2 py-2 bg-transparent border-none text-[15px] text-text placeholder:text-muted/50 focus:ring-0 resize-none font-medium leading-relaxed"
              placeholder="说点什么..."
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (e.target.value.trim()) setPanel(null);
              }}
              onKeyDown={onComposerKeyDown}
              onFocus={() => setPanel(null)}
              disabled={!cfg || busy}
              rows={1}
            />
          </div>

          <div className="py-1 pr-1">
            <button
              className={`
                h-10 px-5 rounded-full flex items-center justify-center gap-1
                text-sm font-semibold text-white shadow-md
                transition-all duration-300
                ${!draft.trim() && !busy
                  ? "bg-gray-300 shadow-none cursor-default opacity-80"
                  : "bg-pink hover:bg-pink/90 hover:scale-105 active:scale-95 shadow-pink/30"
                }
              `}
              onClick={() => void send()}
              disabled={!cfg || busy || !draft.trim()}
            >
              {busy ? <span className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" /> : "发送"}
            </button>
          </div>
        </div>

        {/* Panels (Emoji/Plus) */}
        {panel && (
          <div className="absolute bottom-full mb-3 left-0 w-full animate-fade-in-up origin-bottom">
            <div className="bg-white/90 backdrop-blur-xl border border-white/20 rounded-[24px] shadow-mac-active p-4">
              {panel === "plus" ? (
                <div className="grid grid-cols-4 gap-4">
                  {/* ... options ... */}
                </div>
              ) : (
                <div className="grid grid-cols-8 gap-2">
                  {["😀", "😄", "😉", "🥺", "😳", "😶", "😭", "😤", "😌", "🤍", "✨", "🌙", "🍓", "☕"].map((e) => (
                    <button
                      key={e}
                      className="aspect-square flex items-center justify-center text-2xl hover:bg-black/5 rounded-xl transition-transform active:scale-90"
                      onClick={() => setDraft((d) => d + e)}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
