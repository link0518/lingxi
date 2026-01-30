import { useCallback, useEffect, useMemo, useState } from "react";
import { StitchIcon } from "../ui/stitch/StitchIcon";
import { StitchMobileShell } from "../ui/stitch/StitchMobileShell";
import { StitchMobileTabBar } from "../ui/stitch/StitchMobileTabBar";
import { StitchDesktopShell } from "../ui/stitch/StitchDesktopShell";
import { GrainOverlay } from "../ui/GrainOverlay";
import { GradientBackground } from "../ui/GradientBackground";
import { apiGetMe, loadApiConfig, apiListMomentsPosts, apiCreateMomentsPost, apiCreateMomentsComment, apiToggleMomentsLike, assetUrl } from "../lib/api";

export function MomentsPage() {
  const cfg = useMemo(() => loadApiConfig(), []);
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(min-width: 900px)").matches;
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<
    Array<{
      id: string;
      user: { id: string; name: string; avatarUrl: string };
      content: string;
      media: Array<{ type: "image"; url: string }>;
      createdAt: string;
      likes: string[];
      likedByMe: boolean;
      comments: Array<{ id: string; userId: string; userName: string; userAvatarUrl?: string; content: string; createdAt: string }>;
    }>
  >([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [meName, setMeName] = useState("我");
  const [meAvatarUrl, setMeAvatarUrl] = useState("");

  const refresh = useCallback(async () => {
    if (!cfg) return;
    setError(null);
    try {
      const data = await apiListMomentsPosts(cfg, { limit: 30 });
      setPosts(data.posts);
    } catch (e: unknown) {
      const err = e as { message?: unknown };
      setError(String(err?.message ?? e));
    }
  }, [cfg]);

  useEffect(() => {
    void refresh();
  }, [cfg, refresh]);

  useEffect(() => {
    if (!cfg) return;
    (async () => {
      try {
        const me = await apiGetMe(cfg);
        setMeName(me.displayName || "我");
        setMeAvatarUrl(me.avatarUrl || "");
      } catch {
        // ignore
      }
    })();
  }, [cfg]);

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

  function formatWhen(ts: string) {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleString();
  }

  async function publish() {
    if (!cfg) return;
    const content = composerText.trim();
    if (!content) return;
    setBusy(true);
    setError(null);
    try {
      await apiCreateMomentsPost(cfg, { content });
      setComposerText("");
      setComposerOpen(false);
      await refresh();
    } catch (e: unknown) {
      const err = e as { message?: unknown };
      setError(String(err?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleLike(postId: string, nextLiked: boolean) {
    if (!cfg) return;
    setPosts((prev) =>
      prev.map((p) =>
        p.id !== postId
          ? p
          : {
            ...p,
            likedByMe: nextLiked,
            likes: nextLiked
              ? Array.from(new Set([...p.likes, "你"]))
              : p.likes.filter((x) => x !== "你"),
          }
      )
    );
    try {
      await apiToggleMomentsLike(cfg, { postId, liked: nextLiked });
      await refresh();
    } catch (e: unknown) {
      const err = e as { message?: unknown };
      setError(String(err?.message ?? e));
      await refresh();
    }
  }

  async function addComment(postId: string) {
    if (!cfg) return;
    const content = (commentDraft[postId] ?? "").trim();
    if (!content) return;
    setBusy(true);
    setError(null);
    try {
      await apiCreateMomentsComment(cfg, { postId, content });
      setCommentDraft((m) => ({ ...m, [postId]: "" }));
      await refresh();
    } catch (e: unknown) {
      const err = e as { message?: unknown };
      setError(String(err?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  const mobile = (
    <StitchMobileShell
      title="朋友圈"
      topRight={
        <button
          className="flex items-center justify-center size-9 rounded-full bg-surface-2 text-text hover:bg-pink-soft transition-colors"
          onClick={() => setComposerOpen(true)}
          disabled={!cfg}
          title={!cfg ? "请先登录" : "发布"}
        >
          <StitchIcon name="edit_square" className="text-[22px]" />
        </button>
      }
      bottomNav={<StitchMobileTabBar />}
    >
      <main className="flex flex-col w-full pb-24 bg-surface">
        {/* Hero / cover */}
        <div className="relative w-full mb-10">
          <div className="w-full h-56 bg-[radial-gradient(circle_at_30%_25%,rgb(var(--pink-soft)_/_0.9),transparent_55%),radial-gradient(circle_at_80%_20%,rgb(var(--cta-soft)_/_0.7),transparent_55%)]">
            <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
          </div>

          <div className="absolute -bottom-8 right-5 flex items-end gap-3">
            <div className="flex flex-col items-end mb-8 mr-1 drop-shadow-sm">
              <h1 className="text-white text-xl font-bold tracking-tight">{meName}</h1>
            </div>
            <div className="size-16 rounded-xl bg-surface p-0.5 shadow-lg overflow-hidden cursor-pointer">
              {meAvatarUrl ? (
                <img
                  alt={meName}
                  src={cfg ? assetUrl(cfg.baseUrl, meAvatarUrl) : meAvatarUrl}
                  className="w-full h-full rounded-lg object-cover bg-surface-2 border border-line"
                />
              ) : (
                <div className="w-full h-full rounded-lg bg-surface-2 border border-line flex items-center justify-center font-bold text-text">
                  {meName.slice(0, 1)}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 space-y-4">
          {error ? (
            <div className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">{error}</div>
          ) : null}

          {posts.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted">暂无动态</div>
          ) : null}

          {posts.map((p) => (
            <article key={p.id} className="flex gap-3">
              <div className="flex-shrink-0">
                {p.user.avatarUrl ? (
                  <img
                    alt={p.user.name}
                    src={cfg ? assetUrl(cfg.baseUrl, p.user.avatarUrl) : p.user.avatarUrl}
                    className="size-10 rounded-lg object-cover bg-surface-2 border border-line"
                  />
                ) : (
                  <div className="size-10 rounded-lg bg-surface-2 border border-line flex items-center justify-center font-bold text-text">
                    {p.user.name.slice(0, 1)}
                  </div>
                )}
              </div>
              <div className="flex flex-col flex-1 gap-2">
                <h3 className="text-[#3b4a6b] font-bold text-base">{p.user.name}</h3>
                <p className="text-text text-[15px] whitespace-pre-wrap">{p.content}</p>

                {p.media?.length ? (
                  <div className="mt-1 max-w-[320px] grid grid-cols-3 gap-2">
                    {p.media.slice(0, 9).map((m, idx) => (
                      <div key={`${p.id}_${idx}`} className="aspect-square rounded bg-surface-2 border border-line overflow-hidden">
                        {m.type === "image" ? (
                          <img alt="" src={m.url} className="w-full h-full object-cover" />
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="flex items-center justify-between mt-1">
                  <span className="text-muted text-xs">{formatWhen(p.createdAt)}</span>
                  <div className="flex items-center gap-2">
                    <button
                      className="bg-surface-2 hover:bg-pink-soft text-cta rounded px-2 py-0.5 flex items-center justify-center transition-colors"
                      onClick={() => void toggleLike(p.id, !p.likedByMe)}
                      disabled={!cfg || busy}
                      title={p.likedByMe ? "取消点赞" : "点赞"}
                    >
                      <StitchIcon name="favorite" className="text-lg" fill={p.likedByMe ? 1 : 0} />
                    </button>
                  </div>
                </div>

                {(p.likes?.length || p.comments?.length) ? (
                  <div className="bg-bg rounded mt-2 p-3 text-sm flex flex-col gap-2 relative border border-line/40">
                    <div className="absolute -top-1.5 left-4 w-3 h-3 bg-bg rotate-45 border-l border-t border-line/40" />
                    {p.likes?.length ? (
                      <div className="flex items-start gap-2">
                        <StitchIcon name="favorite" className="text-cta text-[18px]" fill={1} />
                        <div className="flex flex-wrap gap-1 text-[#3b4a6b] font-semibold text-[13px] leading-5">
                          {p.likes.slice(0, 18).map((n) => (
                            <span key={n}>{n}</span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {p.comments?.length ? (
                      <div className="flex flex-col gap-1 text-[13px] leading-5">
                        {p.comments.slice(0, 50).map((c) => (
                          <div key={c.id} className="text-[#3b4a6b]">
                            <span className="font-semibold">{c.userName}</span>：{c.content}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-2 flex items-center gap-2">
                  <input
                    className="flex-1 ui-input h-10"
                    placeholder="评论…"
                    value={commentDraft[p.id] ?? ""}
                    onChange={(e) => setCommentDraft((m) => ({ ...m, [p.id]: e.target.value }))}
                    disabled={!cfg || busy}
                  />
                  <button
                    className="ui-btn-primary h-10 px-4 text-sm"
                    onClick={() => void addComment(p.id)}
                    disabled={!cfg || busy || !(commentDraft[p.id] ?? '').trim()}
                  >
                    发送
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </main>

      {composerOpen ? (
        <div className="fixed inset-0 z-[200] flex items-end justify-center">
          <button className="absolute inset-0 bg-black/20" onClick={() => !busy && setComposerOpen(false)} aria-label="关闭" />
          <div className="relative w-full rounded-t-2xl border border-line bg-surface shadow-soft p-4">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold text-text">发布动态</div>
              <button className="ui-btn-ghost h-9 px-3 text-sm" onClick={() => setComposerOpen(false)} disabled={busy}>
                取消
              </button>
            </div>
            <textarea
              className="mt-3 min-h-28 w-full resize-none rounded-control bg-surface-2/80 border border-line px-4 py-3 text-[14px] leading-6 placeholder:text-muted/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink/35"
              placeholder="写点什么…"
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              disabled={busy}
            />
            <div className="mt-3 flex justify-end">
              <button className="ui-btn-primary h-10 px-4 text-sm" onClick={() => void publish()} disabled={busy || !composerText.trim()}>
                {busy ? "发布中…" : "发布"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </StitchMobileShell>
  );

  if (!isDesktop) return mobile;

  const leftPane = (
    <>
      <div className="px-5 pt-6 pb-2">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-2xl font-bold tracking-tight text-text">Discover</h2>
          <button className="flex items-center justify-center size-10 rounded-full bg-surface-2 text-text hover:bg-pink-soft transition-colors" disabled>
            <StitchIcon name="photo_camera" className="text-[22px]" />
          </button>
        </div>
        <div className="text-sm text-muted">朋友圈/发现（桌面版占位）</div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 text-sm text-muted">
        这里后续按 moments_feed_screen 做右侧主内容流。
      </div>
    </>
  );

  const rightPane = (
    <div className="flex-1 min-h-0 overflow-y-auto bg-white/30">
      <div className="p-6 max-w-[820px]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-bold text-text">Moments</div>
            <div className="mt-1 text-sm text-muted">已接入数据源（读/发/评/赞）。</div>
          </div>
          <button className="ui-btn-primary h-10 px-4 text-sm" onClick={() => setComposerOpen(true)} disabled={!cfg}>
            发布
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">{error}</div>
        ) : null}

        <div className="mt-5 space-y-5">
          {posts.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted">暂无动态</div>
          ) : null}

          {posts.map((p) => (
            <div key={p.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start gap-3">
                {p.user.avatarUrl ? (
                  <img
                    alt={p.user.name}
                    src={cfg ? assetUrl(cfg.baseUrl, p.user.avatarUrl) : p.user.avatarUrl}
                    className="size-10 rounded-lg object-cover bg-surface-2 border border-line"
                  />
                ) : (
                  <div className="size-10 rounded-lg bg-surface-2 border border-line flex items-center justify-center font-bold text-text">
                    {p.user.name.slice(0, 1)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="truncate font-semibold text-text">{p.user.name}</div>
                    <div className="text-xs text-muted shrink-0">{formatWhen(p.createdAt)}</div>
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-[14px] leading-6 text-text">{p.content}</div>
                  {p.media?.length ? (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {p.media.slice(0, 9).map((m, idx) => (
                        <div key={`${p.id}_${idx}`} className="aspect-square rounded bg-surface-2 border border-line overflow-hidden">
                          {m.type === "image" ? <img alt="" src={m.url} className="w-full h-full object-cover" /> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      className="ui-btn-ghost h-10 px-3 text-sm"
                      onClick={() => void toggleLike(p.id, !p.likedByMe)}
                      disabled={!cfg || busy}
                    >
                      <StitchIcon name="favorite" className="text-[18px]" fill={p.likedByMe ? 1 : 0} />
                      <span className="ml-1">{p.likedByMe ? "已赞" : "点赞"}</span>
                      {p.likes?.length ? <span className="ml-2 text-muted">({p.likes.length})</span> : null}
                    </button>
                  </div>

                  {(p.likes?.length || p.comments?.length) ? (
                    <div className="mt-3 rounded-xl border border-white/20 bg-white/5 backdrop-blur-md p-3 text-sm">
                      {p.likes?.length ? (
                        <div className="flex items-start gap-2">
                          <StitchIcon name="favorite" className="text-cta text-[18px]" fill={1} />
                          <div className="flex flex-wrap gap-1 text-[#3b4a6b] font-semibold text-[13px] leading-5">
                            {p.likes.slice(0, 18).map((n) => (
                              <span key={n}>{n}</span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {p.comments?.length ? (
                    <div className="mt-2 flex flex-col gap-1 text-[13px] leading-5">
                      {p.comments.slice(0, 50).map((c) => (
                        <div key={c.id} className="flex items-start gap-2 text-[#3b4a6b]">
                          {c.userAvatarUrl ? (
                            <img
                              alt={c.userName}
                              src={cfg ? assetUrl(cfg.baseUrl, c.userAvatarUrl) : c.userAvatarUrl}
                              className="mt-0.5 size-6 rounded-full object-cover border border-line bg-surface-2"
                            />
                          ) : (
                            <div className="mt-0.5 size-6 rounded-full bg-surface-2 border border-line flex items-center justify-center text-[10px] font-bold text-text">
                              {c.userName.slice(0, 1)}
                            </div>
                          )}
                          <div className="flex-1">
                            <span className="font-semibold">{c.userName}</span>：{c.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                    </div>
                  ) : null}

                  <div className="mt-3 flex items-center gap-2">
                    <input
                      className="flex-1 ui-input h-10"
                      placeholder="评论…"
                      value={commentDraft[p.id] ?? ""}
                      onChange={(e) => setCommentDraft((m) => ({ ...m, [p.id]: e.target.value }))}
                      disabled={!cfg || busy}
                    />
                    <button
                      className="ui-btn-primary h-10 px-4 text-sm"
                      onClick={() => void addComment(p.id)}
                      disabled={!cfg || busy || !(commentDraft[p.id] ?? '').trim()}
                    >
                      发送
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <GrainOverlay />
      <GradientBackground />
      <StitchDesktopShell activeNav="moments" leftPane={leftPane} rightPane={rightPane} />
      {composerOpen ? (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
          <button className="absolute inset-0 bg-black/20" onClick={() => !busy && setComposerOpen(false)} aria-label="关闭" />
          <div className="relative w-full sm:max-w-[620px] rounded-t-2xl sm:rounded-2xl border border-line bg-surface shadow-soft p-4">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold text-text">发布动态</div>
              <button className="ui-btn-ghost h-9 px-3 text-sm" onClick={() => setComposerOpen(false)} disabled={busy}>
                取消
              </button>
            </div>
            <textarea
              className="mt-3 min-h-32 w-full resize-none rounded-control bg-surface-2/80 border border-line px-4 py-3 text-[14px] leading-6 placeholder:text-muted/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink/35"
              placeholder="写点什么…"
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              disabled={busy}
            />
            <div className="mt-3 flex justify-end">
              <button className="ui-btn-primary h-10 px-4 text-sm" onClick={() => void publish()} disabled={busy || !composerText.trim()}>
                {busy ? "发布中…" : "发布"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
