import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { apiDeleteSession, apiGetCharacter, apiListSessions, apiListSessionsSince, apiSyncMeta, assetUrl, loadApiConfig } from "../lib/api";
import { StitchIcon } from "../ui/stitch/StitchIcon";
import { StitchDesktopShell } from "../ui/stitch/StitchDesktopShell";
import { StitchMobileShell } from "../ui/stitch/StitchMobileShell";
import { StitchMobileTabBar } from "../ui/stitch/StitchMobileTabBar";
import { ChatPane } from "./ChatPane";
import { GrainOverlay } from "../ui/GrainOverlay";
import { GradientBackground } from "../ui/GradientBackground";

type SessionItem = {
  id: string;
  characterName: string;
  characterId?: string;
  createdAt: string;
  avatarUrl?: string;
  lastMessageAt?: string | null;
  lastMessagePreview?: string;
};

type PinnedMap = Record<string, number>;

type SessionsCache = {
  sessions: SessionItem[];
  activeSessionId: string | null;
  lastSyncAt?: string | null;
};

const SESSIONS_CACHE_KEY = "wx:messages:cache:v1";

function loadSessionsCache(userId?: string | null): SessionsCache | null {
  try {
    if (!userId) return null;
    const raw = localStorage.getItem(`${SESSIONS_CACHE_KEY}:${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionsCache;
    if (!parsed || !Array.isArray(parsed.sessions)) return null;
    return {
      sessions: parsed.sessions,
      activeSessionId: parsed.activeSessionId ?? null,
      lastSyncAt: parsed.lastSyncAt ?? null,
    };
  } catch {
    return null;
  }
}

function saveSessionsCache(userId: string | null | undefined, next: SessionsCache) {
  try {
    if (!userId) return;
    localStorage.setItem(`${SESSIONS_CACHE_KEY}:${userId}`, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function loadPinned(): PinnedMap {
  try {
    const raw = localStorage.getItem("wx:pinnedSessions");
    return (raw ? (JSON.parse(raw) as PinnedMap) : {}) ?? {};
  } catch {
    return {};
  }
}

export function MessagesPage() {
  const location = useLocation();
  const cfg = useMemo(() => loadApiConfig(), []);

  const cached = useMemo(() => loadSessionsCache(cfg?.userId ?? null), [cfg?.userId]);
  const [sessions, setSessions] = useState<SessionItem[]>(() => cached?.sessions ?? []);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => cached?.activeSessionId ?? null);
  const [menu, setMenu] = useState<null | { x: number; y: number; sessionId: string }>(null);
  const longPressRef = useRef<number | null>(null);
  const [loading, setLoading] = useState<boolean>(() => !cached);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => cached?.lastSyncAt ?? null);
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(min-width: 900px)").matches;
  });
  const [pinned, setPinned] = useState<PinnedMap>(() => loadPinned());

  function savePinned(next: PinnedMap) {
    setPinned(next);
    try {
      localStorage.setItem("wx:pinnedSessions", JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!cfg) return;
    const hasData = sessions.length > 0;
    if (hasData) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    (async () => {
      try {
        const meta = await apiSyncMeta(cfg);
        const remoteUpdatedAt = meta.sessionsUpdatedAt;
        const shouldFull = !lastSyncAt || !remoteUpdatedAt;
        if (!shouldFull && remoteUpdatedAt && lastSyncAt && remoteUpdatedAt <= lastSyncAt) {
          return;
        }
        const data = lastSyncAt ? await apiListSessionsSince(cfg, lastSyncAt) : await apiListSessions(cfg);
        // 防御：历史数据可能存在同一角色多会话；这里按 characterId 去重展示
        const seen = new Set<string>();
        const baseList = data.sessions
          .filter((s) => {
            const key = s.characterId;
            if (!key) return true;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map((s) => ({
            id: s.id,
            characterId: s.characterId,
            characterName: s.characterName,
            createdAt: s.createdAt,
            avatarUrl: undefined as string | undefined,
            lastMessageAt: s.lastMessageAt ?? null,
            lastMessagePreview: s.lastMessagePreview ?? "",
          }));

        // 补齐头像：sessions 接口不含 avatarUrl，这里按 characterId 拉一次角色详情
        const next = await Promise.all(
          baseList.map(async (s) => {
            if (!s.characterId) return s;
            try {
              const c = await apiGetCharacter(cfg, s.characterId);
              return { ...s, avatarUrl: c.avatarUrl || undefined, characterName: c.name || s.characterName };
            } catch {
              return s;
            }
          })
        );

        setSessions((prev) => {
          if (shouldFull) return next;
          if (!next.length) return prev;
          const map = new Map(prev.map((s) => [s.id, s]));
          for (const s of next) {
            map.set(s.id, s);
          }
          return Array.from(map.values());
        });
        setActiveSessionId((prev) => {
          const fromNav = (location.state as { activeSessionId?: unknown } | null)?.activeSessionId as string | undefined;
          return fromNav ?? prev ?? next[0]?.id ?? null;
        });
        const fromNav = (location.state as { activeSessionId?: unknown } | null)?.activeSessionId as string | undefined;
        const nextActive = fromNav ?? next[0]?.id ?? null;
        saveSessionsCache(cfg?.userId ?? null, { sessions: next, activeSessionId: nextActive, lastSyncAt: remoteUpdatedAt ?? lastSyncAt });
        if (remoteUpdatedAt) setLastSyncAt(remoteUpdatedAt);
      } catch {
        // ignore
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    })();
  }, [cfg, location.state, sessions.length]);

  useEffect(() => {
    const fromNav = (location.state as { activeSessionId?: unknown } | null)?.activeSessionId as string | undefined;
    if (fromNav) {
      window.queueMicrotask(() => setActiveSessionId(fromNav));
    }
  }, [location.state]);

  useEffect(() => {
    saveSessionsCache(cfg?.userId ?? null, { sessions, activeSessionId, lastSyncAt });
  }, [sessions, activeSessionId, lastSyncAt, cfg?.userId]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const m = window.matchMedia("(min-width: 900px)");
    const onChange = () => setIsDesktop(m.matches);
    onChange();
    const legacy = m as MediaQueryList & { addListener?: (cb: () => void) => void; removeListener?: (cb: () => void) => void };
    if ("addEventListener" in m) m.addEventListener("change", onChange);
    else legacy.addListener?.(onChange);
    return () => {
      if ("removeEventListener" in m) m.removeEventListener("change", onChange);
      else legacy.removeListener?.(onChange);
    };
  }, []);

  const sortedSessions = useMemo(() => {
    const rank = (s: SessionItem) => pinned[s.id] ?? 0;
    return [...sessions].sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return rb - ra; // 置顶优先（时间戳越大越靠前）
      const ta = a.lastMessageAt || a.createdAt ? new Date(String(a.lastMessageAt || a.createdAt)).getTime() : 0;
      const tb = b.lastMessageAt || b.createdAt ? new Date(String(b.lastMessageAt || b.createdAt)).getTime() : 0;
      return tb - ta; // 最近会话在前
    });
  }, [pinned, sessions]);

  function openMenu(x: number, y: number, sessionId: string) {
    const w = 200;
    const h = 120;
    const safe = 12;
    const maxX = typeof window !== "undefined" ? window.innerWidth - w - safe : x;
    const maxY = typeof window !== "undefined" ? window.innerHeight - h - safe : y;
    setMenu({ x: Math.min(x, maxX), y: Math.min(y, maxY), sessionId });
  }

  function closeMenu() {
    setMenu(null);
  }

  function startLongPress(sessionId: string, x: number, y: number) {
    if (longPressRef.current) window.clearTimeout(longPressRef.current);
    longPressRef.current = window.setTimeout(() => {
      openMenu(x, y, sessionId);
    }, 420);
  }

  function cancelLongPress() {
    if (longPressRef.current) window.clearTimeout(longPressRef.current);
    longPressRef.current = null;
  }

  async function deleteChat(sessionId: string) {
    if (!cfg) return;
    if (!window.confirm("确定删除该聊天？删除后消息、会话级好感度/记忆等都会清空。")) return;
    try {
      await apiDeleteSession(cfg, sessionId);
    } catch {
      // ignore
    }
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    setActiveSessionId((prev) => (prev === sessionId ? null : prev));
    const nextPinned = { ...pinned };
    delete nextPinned[sessionId];
    savePinned(nextPinned);
    closeMenu();
  }

  function togglePin(sessionId: string) {
    const isPinned = Boolean(pinned[sessionId]);
    const next = { ...pinned };
    if (isPinned) delete next[sessionId];
    else next[sessionId] = Date.now();
    savePinned(next);
    closeMenu();
  }

  const desktopList = (
    <>
      <div className="px-5 pt-6 pb-2 relative z-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-text to-text/70">消息列表</h2>
          {refreshing ? <span className="text-xs text-muted/60">更新中…</span> : null}
        </div>
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <StitchIcon name="search" className="text-muted/60 text-[18px]" />
          </div>
          <input
            className="block w-full pl-10 pr-3 py-2.5 border border-white/10 rounded-xl leading-5 bg-black/5 text-text placeholder:text-muted/50 focus:outline-none focus:bg-white/5 focus:ring-1 focus:ring-pink/20 sm:text-sm transition-all shadow-inner backdrop-blur-sm"
            placeholder="搜索"
            type="text"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 p-3 ui-scrollbar relative z-10">
        {loading && sortedSessions.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3.5 rounded-xl border border-white/10 bg-white/5">
                <div className="w-12 h-12 rounded-full bg-white/10 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 bg-white/10 rounded-full animate-pulse" />
                  <div className="h-3 w-2/3 bg-white/10 rounded-full animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {!loading && sortedSessions.length === 0 ? (
          <div className="p-6 text-sm text-muted/60 text-center">暂无会话，去“通讯录”找一个角色开始吧。</div>
        ) : null}
        {sortedSessions.map((s) => {
          const active = s.id === activeSessionId;
          const isPinned = Boolean(pinned[s.id]);
          const baseCls = "flex items-center gap-3 p-3.5 rounded-xl transition-all duration-300 relative border group";
          const activeCls = "bg-white/10 border-white/10 shadow-lg shadow-black/5 backdrop-blur-md";
          const inactiveCls = "bg-transparent border-transparent hover:bg-white/5 hover:border-white/5";

          return (
            <div
              key={s.id}
              className={`${baseCls} ${active ? activeCls : inactiveCls} ${isPinned ? "bg-white/5 border-white/5" : ""}`}
              onClick={() => setActiveSessionId(s.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                openMenu(e.clientX, e.clientY, s.id);
              }}
              onTouchStart={(e) => {
                const t = e.touches[0];
                startLongPress(s.id, t.clientX, t.clientY);
              }}
              onTouchEnd={cancelLongPress}
              onTouchCancel={cancelLongPress}
            >
              {/* Active Indicator Line */}
              {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-cta to-pink rounded-r-md shadow-[0_0_8px_rgba(var(--pink)_/_0.6)]" />}

              <div className="relative shrink-0">
                {s.avatarUrl ? (
                  <img
                    alt={s.characterName}
                    src={cfg ? assetUrl(cfg.baseUrl, s.avatarUrl) : s.avatarUrl}
                    className="w-12 h-12 rounded-full object-cover border border-white/10 shadow-sm"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full border border-white/10 bg-white/5 flex items-center justify-center font-bold text-text/70">
                    {s.characterName.slice(0, 1)}
                  </div>
                )}
                {isPinned ? (
                  <div className="absolute -top-1.5 -right-1.5 rounded-full border border-line bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-muted shadow-soft">
                    置顶
                  </div>
                ) : null}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-1">
                  <h3 className={`text-sm font-medium truncate flex items-center gap-2 ${active ? 'text-text' : 'text-text/80 group-hover:text-text'}`}>
                    <span className="truncate">{s.characterName}</span>
                  </h3>
                  <span className="text-[10px] text-muted/50 font-medium">
                    {(() => {
                      const ts = s.lastMessageAt || s.createdAt;
                      if (!ts) return "";
                      return new Date(ts).toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
                    })()}
                  </span>
                </div>
                <p className="text-xs text-muted/60 truncate font-light group-hover:text-muted/80 transition-colors">
                  {s.lastMessagePreview?.trim() ? s.lastMessagePreview.trim() : "暂无消息"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );

  const desktopRight = activeSessionId ? <ChatPane sessionId={activeSessionId} embedded /> : <div className="flex-1 min-h-0" />;

  return (
    <>
      <GrainOverlay />
      <GradientBackground />
      {isDesktop ? (
        <StitchDesktopShell activeNav="messages" leftPane={desktopList} rightPane={desktopRight} />
      ) : (
        <StitchMobileShell
          title="聊天"
          bottomNav={<StitchMobileTabBar />}
        >
          <div className="px-5 py-1 shrink-0 bg-transparent relative z-10">
            <div className="relative flex items-center w-full h-11 rounded-xl bg-white/10 border border-white/20 overflow-hidden group focus-within:ring-2 focus-within:ring-cta/20 focus-within:bg-white/20 transition-all backdrop-blur-md shadow-sm">
              <div className="flex items-center justify-center pl-4 text-muted/70">
                <StitchIcon name="search" />
              </div>
              <input
                className="w-full h-full bg-transparent border-none text-sm font-medium text-text placeholder:text-muted/50 focus:ring-0 focus:outline-none pl-3"
                placeholder="搜索"
                type="text"
              />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 pb-24 space-y-1 relative z-10">
            {sortedSessions.length === 0 ? <div className="px-4 py-8 text-sm text-muted text-center">暂无会话，去“通讯录”找一个角色开始吧。</div> : null}
            {sortedSessions.map((s) => {
              const isPinned = Boolean(pinned[s.id]);
              return (
                <Link
                  key={s.id}
                  to={`/chat/${s.id}`}
                  className={[
                    "group flex items-center gap-3 p-3 rounded-2xl active:bg-white/20 cursor-pointer transition-colors",
                    isPinned ? "bg-white/10 border border-white/5" : "hover:bg-white/10 border border-transparent",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openMenu(e.clientX, e.clientY, s.id);
                  }}
                  onTouchStart={(e) => {
                    const t = e.touches[0];
                    startLongPress(s.id, t.clientX, t.clientY);
                  }}
                  onTouchEnd={cancelLongPress}
                  onTouchCancel={cancelLongPress}
                >
                  <div className="relative shrink-0">
                    {s.avatarUrl ? (
                      <img
                        alt={s.characterName}
                        src={cfg ? assetUrl(cfg.baseUrl, s.avatarUrl) : s.avatarUrl}
                        className="size-14 rounded-full object-cover bg-surface-2 border border-line"
                      />
                    ) : (
                      <div className="size-14 rounded-full bg-surface-2 border border-line flex items-center justify-center text-text font-bold">
                        {s.characterName.slice(0, 1)}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col flex-1 min-w-0 justify-center">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <h3 className="text-base font-bold text-text truncate flex items-center gap-2">
                        {isPinned ? (
                          <span className="text-[11px] rounded-control border border-line bg-surface px-2 py-0.5 text-muted shrink-0">置顶</span>
                        ) : null}
                        <span className="truncate">{s.characterName}</span>
                      </h3>
                      <span className="text-xs font-medium text-muted shrink-0">{(s.lastMessageAt || s.createdAt) ? new Date(String(s.lastMessageAt || s.createdAt)).toLocaleDateString() : ""}</span>
                    </div>
                    <p className="text-sm font-normal text-muted truncate">{s.lastMessagePreview?.trim() ? s.lastMessagePreview.trim() : "暂无消息"}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </StitchMobileShell>
      )}

      {menu ? (
        <div className="fixed inset-0 z-[100]">
          <button className="absolute inset-0 bg-black/10" onClick={closeMenu} aria-label="关闭菜单" />
          <div className="absolute min-w-[180px] rounded-xl border border-line bg-surface shadow-soft p-2 text-sm" style={{ left: menu.x, top: menu.y }}>
            <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-2/60 transition" onClick={() => togglePin(menu.sessionId)}>
              {pinned[menu.sessionId] ? "取消置顶" : "置顶"}
            </button>
            <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-2/60 transition text-red-600" onClick={() => void deleteChat(menu.sessionId)}>
              删除聊天
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
