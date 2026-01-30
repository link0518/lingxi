import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  apiDeleteCharacter,
  apiCreateSession,
  apiGetCharacter,
  apiListCharacters,
  apiListCharactersSince,
  apiSyncMeta,
  apiUploadCharacterAvatar,
  apiUpdateCharacterCard,
  apiUpdateCharacterMeta,
  assetUrl,
  loadApiConfig,
  type CharacterCardV1,
} from "../lib/api";
import { StitchIcon } from "../ui/stitch/StitchIcon";
import { StitchMobileShell } from "../ui/stitch/StitchMobileShell";
import { StitchMobileTabBar } from "../ui/stitch/StitchMobileTabBar";
import { StitchDesktopShell } from "../ui/stitch/StitchDesktopShell";
import { CreateCharacterModal } from "../ui/CreateCharacterModal";
import { GrainOverlay } from "../ui/GrainOverlay";
import { GradientBackground } from "../ui/GradientBackground";

type ContactItem = {
  id: string;
  name: string;
  avatarUrl?: string;
  gender?: "unknown" | "male" | "female" | "other";
  updatedAt?: string;
};

type RightDetailState = {
  id: string;
  name: string;
  avatarUrl: string;
  gender: "unknown" | "male" | "female" | "other";
  card: CharacterCardV1;
};

type ContactsCache = {
  contacts: ContactItem[];
  activeContactId: string | null;
  lastSyncAt?: string | null;
};

const CONTACTS_CACHE_KEY = "wx:contacts:cache:v1";

function loadContactsCache(userId?: string | null): ContactsCache | null {
  try {
    if (!userId) return null;
    const raw = localStorage.getItem(`${CONTACTS_CACHE_KEY}:${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ContactsCache;
    if (!parsed || !Array.isArray(parsed.contacts)) return null;
    return {
      contacts: parsed.contacts,
      activeContactId: parsed.activeContactId ?? null,
      lastSyncAt: parsed.lastSyncAt ?? null,
    };
  } catch {
    return null;
  }
}

function saveContactsCache(userId: string | null | undefined, next: ContactsCache) {
  try {
    if (!userId) return;
    localStorage.setItem(`${CONTACTS_CACHE_KEY}:${userId}`, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function groupKey(name: string) {
  const c = (name || "#").trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
}

export function ContactsPage() {
  const navigate = useNavigate();
  const cfg = useMemo(() => loadApiConfig(), []);
  const cached = useMemo(() => loadContactsCache(cfg?.userId ?? null), [cfg?.userId]);
  const [contacts, setContacts] = useState<ContactItem[]>(() => cached?.contacts ?? []);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [menu, setMenu] = useState<null | { x: number; y: number; contactId: string }>(null);
  const longPressRef = useRef<number | null>(null);
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(min-width: 900px)").matches;
  });
  const [activeContactId, setActiveContactId] = useState<string | null>(() => cached?.activeContactId ?? null);
  const [detail, setDetail] = useState<RightDetailState | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailSaved, setDetailSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(() => !cached);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => cached?.lastSyncAt ?? null);

  const refreshContacts = useCallback(async () => {
    if (!cfg) return;
    const hasData = contacts.length > 0;
    if (hasData) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const meta = await apiSyncMeta(cfg);
      const remoteUpdatedAt = meta.charactersUpdatedAt;
      const shouldFull = !lastSyncAt || !remoteUpdatedAt;
      if (shouldFull) {
        const data = await apiListCharacters(cfg);
        setContacts(
          (data.characters || []).map((c) => ({
            id: String(c.id),
            name: c.name,
            avatarUrl: c.avatarUrl || undefined,
            gender: c.gender ?? "unknown",
            updatedAt: c.updatedAt,
          }))
        );
      } else if (remoteUpdatedAt && lastSyncAt && remoteUpdatedAt > lastSyncAt) {
        const data = await apiListCharactersSince(cfg, lastSyncAt);
        if (data.characters?.length) {
          setContacts((prev) => {
            const map = new Map(prev.map((c) => [c.id, c]));
            for (const c of data.characters) {
              map.set(String(c.id), {
                id: String(c.id),
                name: c.name,
                avatarUrl: c.avatarUrl || undefined,
                gender: c.gender ?? "unknown",
                updatedAt: c.updatedAt,
              });
            }
            return Array.from(map.values());
          });
        }
      }
      if (remoteUpdatedAt) setLastSyncAt(remoteUpdatedAt);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cfg, contacts.length, lastSyncAt]);


  useEffect(() => {
    void refreshContacts();
  }, [refreshContacts]);


  useEffect(() => {
    if (!cfg || !isDesktop) return;
    if (!activeContactId) {
      setDetail(null);
      return;
    }
    setDetailBusy(true);
    setDetailError(null);
    setDetailSaved(null);
    (async () => {
      try {
        const data = await apiGetCharacter(cfg, activeContactId);
        const maybe = data as { error?: unknown; gender?: unknown };
        if (maybe?.error) throw new Error(String(maybe.error));
        setDetail({
          id: data.id,
          name: data.name,
          avatarUrl: data.avatarUrl ?? "",
          gender: (maybe.gender as RightDetailState["gender"] | undefined) ?? "unknown",
          card: data.card,
        });
      } catch (e: unknown) {
        const err = e as { message?: unknown };
        setDetailError(String(err?.message ?? e));
        setDetail(null);
      } finally {
        setDetailBusy(false);
      }
    })();
  }, [activeContactId, cfg, isDesktop]);

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

  useEffect(() => {
    saveContactsCache(cfg?.userId ?? null, { contacts, activeContactId, lastSyncAt });
  }, [contacts, activeContactId, lastSyncAt, cfg?.userId]);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? contacts.filter((c) => {
        const name = (c.name || "").toLowerCase();
        return name.includes(q);
      })
      : contacts;
    const map = new Map<string, ContactItem[]>();
    for (const c of filtered) {
      const key = groupKey(c.name);
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    for (const [k, arr] of map) {
      arr.sort((a, b) => a.name.localeCompare(b.name));
      map.set(k, arr);
    }
    const keys = [...map.keys()].sort((a, b) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)));
    return keys.map((k) => ({ key: k, items: map.get(k)! }));
  }, [contacts, search]);

  function openMenu(x: number, y: number, contactId: string) {
    const w = 200;
    const h = 120;
    const safe = 12;
    const maxX = typeof window !== "undefined" ? window.innerWidth - w - safe : x;
    const maxY = typeof window !== "undefined" ? window.innerHeight - h - safe : y;
    setMenu({ x: Math.min(x, maxX), y: Math.min(y, maxY), contactId });
  }

  function closeMenu() {
    setMenu(null);
  }

  function startLongPress(contactId: string, x: number, y: number) {
    if (longPressRef.current) window.clearTimeout(longPressRef.current);
    longPressRef.current = window.setTimeout(() => {
      openMenu(x, y, contactId);
    }, 420);
  }

  function cancelLongPress() {
    if (longPressRef.current) window.clearTimeout(longPressRef.current);
    longPressRef.current = null;
  }

  async function saveDetail() {
    if (!cfg || !detail) return;
    setDetailBusy(true);
    setDetailError(null);
    setDetailSaved(null);
    try {
      if (!detail.card.name.trim()) throw new Error("请填写角色名称");
      await apiUpdateCharacterCard(cfg, detail.id, detail.card);
      await apiUpdateCharacterMeta(cfg, detail.id, {
        name: detail.card.name.trim(),
        gender: detail.gender,
        avatarUrl: detail.avatarUrl || undefined,
      });
      setDetailSaved("已保存");
      await refreshContacts();
      window.setTimeout(() => setDetailSaved((prev) => (prev === "已保存" ? null : prev)), 1200);
    } catch (e: unknown) {
      const err = e as { message?: unknown };
      setDetailError(String(err?.message ?? e));
    } finally {
      setDetailBusy(false);
    }
  }

  async function uploadDetailAvatar(file: File) {
    if (!cfg || !detail) return;
    setDetailBusy(true);
    setDetailError(null);
    try {
      if (!file.type.startsWith("image/")) throw new Error("仅支持图片文件");
      if (file.size > 2 * 1024 * 1024) throw new Error("图片过大（上限 2MB）");
      const { url } = await apiUploadCharacterAvatar(cfg, file);
      setDetail((d) => (d ? { ...d, avatarUrl: url } : d));
    } catch (e: unknown) {
      const err = e as { message?: unknown };
      setDetailError(String(err?.message ?? e));
    } finally {
      setDetailBusy(false);
    }
  }

  const mobile = (
    <StitchMobileShell
      title="通讯录"
      topRight={
        <button
          className="flex items-center justify-center size-9 rounded-full bg-white/10 text-text hover:bg-pink-soft transition-colors backdrop-blur-md border border-white/10"
          title="创建角色"
          onClick={() => setCreateOpen(true)}
        >
          <StitchIcon name="add_circle" />
        </button>
      }
      bottomNav={<StitchMobileTabBar />}
    >
      <div className="px-5 pb-2 bg-transparent shrink-0 z-10 pt-2">
        <div className="flex w-full items-center bg-white/10 border border-white/20 rounded-xl h-10 px-3 transition-all backdrop-blur-md focus-within:bg-white/20 focus-within:border-pink/20 shadow-sm">
          <StitchIcon name="search" className="text-muted/60 mr-2 text-[18px]" />
          <input
            className="w-full bg-transparent border-none focus:ring-0 text-text placeholder:text-muted/50 text-sm font-medium px-0 padding-0"
            placeholder="搜索"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto relative bg-transparent pb-24 z-10 px-2">
        {loading && grouped.length === 0 ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="size-12 rounded-xl bg-white/5 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 bg-white/5 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {!loading && grouped.length === 0 ? <div className="p-8 text-sm text-muted text-center">暂无联系人</div> : null}

        {grouped.map((g) => (
          <div key={g.key} className="mb-2">
            <div className="sticky top-0 z-10 px-4 py-1.5 text-[11px] font-bold text-muted/60 uppercase tracking-wider bg-white/20 backdrop-blur-md mb-1 rounded-lg mx-2">{g.key}</div>
            <div className="space-y-1">
              {g.items.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 p-3 active:bg-white/20 rounded-2xl transition-colors mx-1 border border-transparent active:border-white/5"
                  onClick={async () => {
                    if (!cfg || busyId === c.id) return;
                    setBusyId(c.id);
                    try {
                      const { sessionId } = await apiCreateSession(cfg, c.id);
                      navigate(`/chat/${sessionId}`);
                    } catch {
                      // ignore
                    } finally {
                      setBusyId(null);
                    }
                  }}
                  onContextMenu={(e) => {
                    if (!cfg || busyId === c.id) return;
                    e.preventDefault();
                    openMenu(e.clientX, e.clientY, c.id);
                  }}
                  onTouchStart={(e) => {
                    if (!cfg || busyId === c.id) return;
                    const t = e.touches[0];
                    startLongPress(c.id, t.clientX, t.clientY);
                  }}
                  onTouchEnd={cancelLongPress}
                  onTouchCancel={cancelLongPress}
                >
                  {c.avatarUrl ? (
                    <img
                      alt={c.name}
                      src={cfg ? assetUrl(cfg.baseUrl, c.avatarUrl) : c.avatarUrl}
                      className="size-12 rounded-xl object-cover bg-surface-2 border border-line shadow-sm"
                    />
                  ) : (
                    <div className="size-12 rounded-xl bg-surface-2 border border-line flex items-center justify-center font-bold text-text text-lg shadow-sm">
                      {c.name.slice(0, 1)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-text text-base font-bold truncate">
                      {c.name}
                    </p>
                    {busyId === c.id ? <p className="text-xs text-muted mt-0.5">连接中…</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {menu ? (
        <div className="fixed inset-0 z-[100]">
          <button className="absolute inset-0 bg-black/10" onClick={closeMenu} aria-label="关闭菜单" />
          <div
            className="absolute min-w-[180px] rounded-xl border border-line bg-surface shadow-soft p-2 text-sm"
            style={{ left: menu.x, top: menu.y }}
          >
            <button
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-2/60 transition"
              onClick={() => {
                const id = menu.contactId;
                closeMenu();
                setEditId(id);
                setCreateOpen(true);
              }}
            >
              编辑角色
            </button>
            <button
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-2/60 transition text-red-600"
              onClick={async () => {
                if (!cfg) return;
                const characterId = menu.contactId;
                closeMenu();
                if (!window.confirm("确定删除该角色？将同时删除其会话与消息（当前为物理删除）。")) return;
                setBusyId(characterId);
                try {
                  await apiDeleteCharacter(cfg, characterId);
                  await refreshContacts();
                  // await refreshActiveSessions(); // Removed undefined call
                  setActiveContactId((prev) => (prev === characterId ? null : prev));
                  setDetail(null);
                } finally {
                  setBusyId(null);
                }
              }}
            >
              删除角色
            </button>
          </div>
        </div>
      ) : null}
    </StitchMobileShell>
  );

  const leftPane = (
    <>
      <div className="px-5 pt-6 pb-2 relative z-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-text to-text/70">通讯录</h2>
          {refreshing ? <span className="text-xs text-muted/60">更新中…</span> : null}
          <button
            className="flex items-center justify-center size-9 rounded-full bg-black/5 text-muted hover:text-text hover:bg-black/10 transition-colors active:scale-90"
            title="创建角色"
            onClick={() => setCreateOpen(true)}
          >
            <StitchIcon name="add" className="text-[22px]" />
          </button>
        </div>
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <StitchIcon name="search" className="text-muted/60 text-[18px]" />
          </div>
          <input
            className="block w-full pl-10 pr-3 py-2.5 border border-white/10 rounded-xl leading-5 bg-black/5 text-text placeholder:text-muted/50 focus:outline-none focus:bg-white/5 focus:ring-1 focus:ring-pink/20 sm:text-sm transition-all shadow-inner backdrop-blur-sm"
            placeholder="搜索"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto relative bg-surface">
        {grouped.length === 0 ? (
          <div className="p-6 text-sm text-muted">暂无联系人</div>
        ) : (
          <div className="p-3 space-y-5">
            {grouped.map((g) => (
              <div key={g.key} className="relative">
                <div className="sticky top-0 z-10 px-4 py-1.5 text-[11px] font-bold text-muted/60 uppercase tracking-wider bg-white/40 backdrop-blur-md mb-2">{g.key}</div>
                <div className="space-y-1">
                  {g.items.map((c) => {
                    const active = c.id === activeContactId;
                    const itemCls = active
                      ? "w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl bg-white/10 border border-white/10 shadow-lg shadow-black/5 backdrop-blur-md transition-all duration-300"
                      : "w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl bg-transparent border border-transparent hover:bg-white/5 hover:border-white/5 transition-all duration-200 group";

                    return (
                      <div
                        key={c.id}
                        role="button"
                        tabIndex={0}
                        className={itemCls}
                        aria-disabled={!cfg || busyId === c.id}
                        onContextMenu={(e) => {
                          if (!cfg || busyId === c.id) return;
                          e.preventDefault();
                          openMenu(e.clientX, e.clientY, c.id);
                        }}
                        onTouchStart={(e) => {
                          if (!cfg || busyId === c.id) return;
                          const t = e.touches[0];
                          startLongPress(c.id, t.clientX, t.clientY);
                        }}
                        onTouchEnd={cancelLongPress}
                        onTouchCancel={cancelLongPress}
                        onClick={() => {
                          if (!cfg || busyId === c.id) return;
                          setActiveContactId(c.id);
                        }}
                        onKeyDown={(e) => {
                          if (!cfg || busyId === c.id) return;
                          if (e.key === "Enter" || e.key === " ") setActiveContactId(c.id);
                        }}
                      >
                        {/* Active Indicator Line */}
                        {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-cta to-pink rounded-r-md shadow-[0_0_8px_rgba(var(--pink)_/_0.6)]" />}

                        {c.avatarUrl ? (
                          <img
                            alt={c.name}
                            src={cfg ? assetUrl(cfg.baseUrl, c.avatarUrl) : c.avatarUrl}
                            className={`size-11 rounded-full object-cover border transition-all shadow-sm ${active ? 'border-white/20' : 'border-white/10'}`}
                          />
                        ) : (
                          <div className={`size-11 rounded-full flex items-center justify-center font-bold text-text border transition-all shadow-sm ${active ? 'border-white/20 bg-white/10' : 'border-white/10 bg-white/5'}`}>
                            {c.name.slice(0, 1)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className={`truncate text-sm font-semibold transition-colors ${active ? 'text-text' : 'text-text/80'}`}>{c.name}</div>
                          {/* <div className="text-xs text-muted/60">{busyId === c.id ? "连接中…" : "详情"}</div> */}
                        </div>
                        {active || (
                          <button
                            type="button"
                            className="shrink-0 inline-flex items-center justify-center size-8 rounded-full hover:bg-black/5 text-muted/50 hover:text-text transition-all opacity-0 group-hover:opacity-100"
                            aria-label="更多"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                              openMenu(rect.left, rect.bottom + 6, c.id);
                            }}
                          >
                            <StitchIcon name="more_horiz" className="text-[20px]" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );

  const rightPane = (
    <div className="flex-1 min-h-0 overflow-y-auto bg-gradient-to-br from-white/10 via-surface/30 to-white/10">
      {!activeContactId ? (
        <div className="h-full flex flex-col items-center justify-center text-muted/40 gap-4">
          <div className="w-24 h-24 rounded-3xl bg-surface-2/50 flex items-center justify-center mb-2">
            <StitchIcon name="person" className="text-[48px] opacity-60" />
          </div>
          <p className="text-base font-medium">请选择联系人查看详情</p>
        </div>
      ) : detailBusy ? (
        <div className="h-full flex items-center justify-center text-muted/60">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-pink/40 border-t-pink rounded-full animate-spin" />
            <span>加载中…</span>
          </div>
        </div>
      ) : detailError ? (
        <div className="p-8 text-sm text-red-500 bg-red-50/50 rounded-xl m-6">{detailError}</div>
      ) : !detail ? (
        <div className="p-6 text-sm text-muted">未找到角色信息</div>
      ) : (
        <div className="p-8 max-w-4xl mx-auto space-y-6">
          {/* Header Card */}
          <div className="mac-glass-panel p-6 flex items-start justify-between gap-6">
            <div className="flex items-center gap-5">
              {detail.avatarUrl ? (
                <img
                  alt={detail.name}
                  src={cfg ? assetUrl(cfg.baseUrl, detail.avatarUrl) : detail.avatarUrl}
                  className="size-20 rounded-2xl object-cover border border-white/20 shadow-md shrink-0 bg-surface-2"
                />
              ) : (
                <div className="size-20 rounded-2xl border border-white/20 bg-gradient-to-br from-pink/5 to-cta/5 flex items-center justify-center font-bold text-2xl text-text shadow-md shrink-0">
                  {detail.name.slice(0, 1)}
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-text mb-1">{detail.name}</h1>
                <div className="flex items-center gap-2 text-sm text-muted/80">
                  <span className="px-2 py-0.5 rounded-md bg-black/5 border border-black/5 text-xs font-medium">
                    {detail.gender === 'female' ? '女' : detail.gender === 'male' ? '男' : '未知'}
                  </span>
                  <span>ID: {detail.id.slice(0, 8)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                className="h-10 px-6 rounded-xl bg-white border border-black/5 hover:bg-gray-50 active:scale-95 transition-all text-sm font-medium text-text shadow-sm"
                onClick={async () => {
                  if (!cfg) return;
                  setBusyId(detail.id);
                  try {
                    const { sessionId } = await apiCreateSession(cfg, detail.id);
                    navigate(`/messages`, { state: { activeSessionId: sessionId } });
                  } finally {
                    setBusyId(null);
                  }
                }}
                disabled={!cfg || busyId === detail.id}
              >
                发消息
              </button>
              <button
                className="h-10 px-5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 active:scale-95 transition-all text-sm font-medium"
                onClick={async () => {
                  if (!cfg) return;
                  if (!window.confirm("确定删除该角色？将同时删除其会话与消息（当前为物理删除）。")) return;
                  setBusyId(detail.id);
                  try {
                    await apiDeleteCharacter(cfg, detail.id);
                    await refreshContacts();
                    setActiveContactId(null);
                    setDetail(null);
                  } finally {
                    setBusyId(null);
                  }
                }}
                disabled={!cfg || busyId === detail.id}
              >
                删除
              </button>
              <button
                className="ui-btn-primary h-10 px-6 text-sm"
                onClick={saveDetail}
                disabled={!cfg || detailBusy}
              >
                {detailBusy ? "保存中..." : "保存修改"}
              </button>
            </div>
          </div>

          {detailSaved && (
            <div className="text-sm text-green-600 bg-green-50/80 backdrop-blur-sm border border-green-100 px-4 py-3 rounded-xl flex items-center gap-2 animate-fade-in-up">
              <StitchIcon name="check_circle" className="text-[18px]" />
              {detailSaved}
            </div>
          )}

          {/* Form Content */}
          <div className="mac-glass-panel p-8 space-y-6 bg-white/40">
            <h3 className="text-lg font-bold text-text mb-4">角色档案</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-muted uppercase tracking-wider ml-1">名称</span>
                <input
                  className="w-full h-11 px-4 rounded-xl border border-black/5 bg-white/50 text-text placeholder:text-muted/40 focus:bg-white focus:border-pink/30 focus:ring-4 focus:ring-pink/10 transition-all outline-none"
                  value={detail.card.name}
                  onChange={(e) => setDetail((d) => (d ? { ...d, card: { ...d.card, name: e.target.value } } : d))}
                  placeholder="例如：澪"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-muted uppercase tracking-wider ml-1">性别</span>
                <div className="relative">
                  <select
                    className="w-full h-11 px-4 rounded-xl border border-black/5 bg-white/50 text-text focus:bg-white focus:border-pink/30 focus:ring-4 focus:ring-pink/10 transition-all outline-none appearance-none cursor-pointer"
                    value={detail.gender}
                    onChange={(e) => setDetail((d) => (d ? { ...d, gender: e.target.value as RightDetailState["gender"] } : d))}
                  >
                    <option value="female">女</option>
                    <option value="male">男</option>
                    <option value="other">其他</option>
                  </select>
                  <StitchIcon name="expand_more" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                </div>
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-muted uppercase tracking-wider ml-1">头像</span>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  className="block w-full text-sm text-muted
                    file:mr-4 file:py-2.5 file:px-4
                    file:rounded-xl file:border-0
                    file:text-xs file:font-semibold
                    file:bg-pink-soft/50 file:text-pink
                    hover:file:bg-pink-soft file:cursor-pointer file:transition-colors"
                  disabled={!cfg || detailBusy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadDetailAvatar(f);
                    e.currentTarget.value = "";
                  }}
                />
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-muted uppercase tracking-wider ml-1">关系</span>
              <input
                className="w-full h-11 px-4 rounded-xl border border-black/5 bg-white/50 text-text placeholder:text-muted/40 focus:bg-white focus:border-pink/30 focus:ring-4 focus:ring-pink/10 transition-all outline-none"
                value={detail.card.relationship}
                onChange={(e) => setDetail((d) => (d ? { ...d, card: { ...d.card, relationship: e.target.value } } : d))}
                placeholder="例如：青梅竹马 / 助手"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-muted uppercase tracking-wider ml-1">设定 (Prompt Context)</span>
              <textarea
                className="w-full min-h-[200px] px-4 py-3 rounded-xl border border-black/5 bg-white/50 text-text placeholder:text-muted/40 focus:bg-white focus:border-pink/30 focus:ring-4 focus:ring-pink/10 transition-all outline-none resize-y leading-relaxed"
                value={detail.card.background}
                onChange={(e) => setDetail((d) => (d ? { ...d, card: { ...d.card, background: e.target.value } } : d))}
                placeholder="在这里详细描述角色的背景故事、性格特征、说话风格等..."
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <GrainOverlay />
      <GradientBackground />
      {isDesktop ? <StitchDesktopShell activeNav="contacts" leftPane={leftPane} rightPane={rightPane} /> : mobile}
      <CreateCharacterModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setEditId(null);
        }}
        cfg={cfg}
        onCreated={() => refreshContacts()}
        editId={editId}
      />
    </>
  );
}
