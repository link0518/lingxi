import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { StitchIcon } from "../ui/stitch/StitchIcon";
import { StitchMobileShell } from "../ui/stitch/StitchMobileShell";
import { StitchMobileTabBar } from "../ui/stitch/StitchMobileTabBar";
import { apiGetAuthMe, apiGetMe, apiUpdateMe, apiUploadAvatar, assetUrl, loadApiConfig, saveApiConfig } from "../lib/api";
import { StitchDesktopShell } from "../ui/stitch/StitchDesktopShell";
import { GrainOverlay } from "../ui/GrainOverlay";
import { GradientBackground } from "../ui/GradientBackground";

export function MePage() {
  const navigate = useNavigate();
  const cfg = useMemo(() => loadApiConfig(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("灵犀用户");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [personaText, setPersonaText] = useState("");
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(min-width: 900px)").matches;
  });

  useEffect(() => {
    if (!cfg) return;
    (async () => {
      try {
        try {
          const auth = await apiGetAuthMe(cfg);
          if (auth?.ok && auth.role && auth.role !== cfg.role) {
            saveApiConfig({ ...cfg, role: auth.role });
          }
        } catch {
          // ignore role refresh errors
        }
        const me = await apiGetMe(cfg);
        setDisplayName(me.displayName || "灵犀用户");
        setAvatarUrl(me.avatarUrl || "");
        setPersonaText(me.personaText || "");
      } catch (e: unknown) {
        const err = e as { message?: unknown };
        setError(String(err?.message ?? e));
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

  async function save() {
    if (!cfg) {
      navigate("/login");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiUpdateMe(cfg, { displayName, avatarUrl, personaText });
      setError("已保存");
      window.setTimeout(() => setError((prev) => (prev === "已保存" ? null : prev)), 1500);
    } catch (e: unknown) {
      const err = e as { message?: unknown };
      setError(String(err?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function uploadAvatar(file: File) {
    if (!cfg) {
      navigate("/login");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!file.type.startsWith("image/")) throw new Error("仅支持图片文件");
      if (file.size > 2 * 1024 * 1024) throw new Error("图片过大（上限 2MB）");
      const { url } = await apiUploadAvatar(cfg, file);
      setAvatarUrl(url);
      await apiUpdateMe(cfg, { avatarUrl: url });
      setError("头像已更新");
      window.setTimeout(() => setError((prev) => (prev === "头像已更新" ? null : prev)), 1500);
    } catch (e: unknown) {
      const err = e as { message?: unknown };
      setError(String(err?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  const mobile = (
    <StitchMobileShell
      title="我的"
      topRight={
        <Link
          to="/settings"
          className="flex items-center justify-center size-9 rounded-full bg-surface-2 text-text hover:bg-pink-soft transition-colors"
          title="设置"
        >
          <StitchIcon name="settings" />
        </Link>
      }
      bottomNav={<StitchMobileTabBar />}
    >
      <div className="p-4 pb-24 space-y-4 bg-bg min-h-full">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50/50 px-4 py-3 text-sm text-red-600 backdrop-blur-md">{error}</div>
        ) : null}

        <div className="mac-glass-panel p-5 flex items-center gap-4">
          {avatarUrl ? (
            <img
              alt="我的头像"
              src={cfg ? assetUrl(cfg.baseUrl, avatarUrl) : avatarUrl}
              className="h-16 w-16 rounded-full object-cover border border-white/20 shadow-md"
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-pink-soft to-white border border-white/20 flex items-center justify-center font-bold text-pink text-xl shadow-sm">
              我
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold text-text mb-0.5">{displayName}</div>
            <div className="text-xs text-muted font-medium">ID: {cfg?.userId ? cfg.userId.slice(0, 8) : "—"}</div>
          </div>
        </div>

        <div className="mac-glass-panel p-5 space-y-5">
          <div className="text-sm font-semibold text-text border-b border-black/5 pb-2">编辑资料</div>
          <div className="space-y-4">
            <label className="block">
              <div className="text-xs text-muted mb-1.5 font-medium ml-1">上传头像</div>
              <input
                type="file"
                accept="image/*"
                className="block w-full text-sm text-muted
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-xs file:font-semibold
                  file:bg-pink-soft file:text-pink
                  hover:file:bg-pink-soft/80 transition-all cursor-pointer"
                disabled={!cfg || busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadAvatar(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            <label className="block">
              <div className="text-xs text-muted mb-1.5 font-medium ml-1">昵称</div>
              <input
                className="w-full h-10 rounded-lg bg-surface-2/50 border border-black/5 px-3 text-sm focus:bg-white focus:border-pink/30 focus:ring-4 focus:ring-pink/10 transition-all outline-none"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="你的昵称"
              />
            </label>
            <label className="block">
              <div className="text-xs text-muted mb-1.5 font-medium ml-1">你的人设（给 AI 看）</div>
              <textarea
                className="w-full min-h-28 rounded-lg bg-surface-2/50 border border-black/5 px-3 py-2 text-sm leading-relaxed focus:bg-white focus:border-pink/30 focus:ring-4 focus:ring-pink/10 transition-all outline-none resize-none"
                value={personaText}
                onChange={(e) => setPersonaText(e.target.value)}
                placeholder="比如：我的性格、边界、喜欢的交流方式…"
              />
            </label>
            <button
              className="ui-btn-primary h-10 w-full text-sm"
              onClick={save}
              disabled={!cfg || busy}
            >
              {busy ? "保存中…" : "保存修改"}
            </button>
          </div>
        </div>
      </div>
    </StitchMobileShell>
  );

  if (!isDesktop) return mobile;

  const leftPane = (
    <div className="flex flex-col h-full bg-transparent">
      <div className="px-5 pt-8 pb-4">
        <h2 className="text-xl font-bold tracking-tight text-text/90">账户</h2>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 space-y-3">
        {error ? (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 border border-red-100">{error}</div>
        ) : null}

        <div className="p-4 rounded-xl bg-white/50 border border-black/5 shadow-sm hover:bg-white/70 transition-colors cursor-default group">
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              <img
                alt="我的头像"
                src={cfg ? assetUrl(cfg.baseUrl, avatarUrl) : avatarUrl}
                className="h-10 w-10 rounded-full object-cover border border-black/5"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-gray-100 to-white border border-black/5 flex items-center justify-center font-bold text-muted text-xs">
                我
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-text group-hover:text-black transition-colors">{displayName}</div>
              <div className="text-[11px] text-muted">ID: {cfg?.userId ? cfg.userId.slice(0, 8) : "—"}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const rightPane = (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="p-10 max-w-[680px] mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-text">编辑资料</h1>
          <p className="text-sm text-muted mt-1">更新你的头像和个人信息</p>
        </div>

        <div className="mac-glass-panel p-8 space-y-6 bg-white/40">
          <div className="flex items-start gap-6">
            <div className="shrink-0 relative group">
              {avatarUrl ? (
                <img
                  alt="头像"
                  src={cfg ? assetUrl(cfg.baseUrl, avatarUrl) : avatarUrl}
                  className="w-20 h-20 rounded-full object-cover shadow-sm border border-black/5"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-surface-2 border border-black/5 flex items-center justify-center text-2xl font-bold text-muted">
                  我
                </div>
              )}
              <div className="absolute inset-0 bg-black/20 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer text-white font-medium text-xs backdrop-blur-sm pointer-events-none">
                更换
              </div>
              <input
                type="file"
                accept="image/*"
                className="absolute inset-0 opacity-0 cursor-pointer"
                title="点击更换头像"
                disabled={!cfg || busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadAvatar(f);
                  e.currentTarget.value = "";
                }}
              />
            </div>
            <div className="flex-1 space-y-5 pt-1">
              <label className="block">
                <div className="text-xs font-medium text-text mb-1.5 ml-1">昵称</div>
                <input
                  className="w-full h-10 rounded-lg bg-white/50 backdrop-blur-sm border border-black/10 px-3 text-sm focus:border-pink/50 focus:ring-4 focus:ring-pink/10 transition-all outline-none shadow-sm"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={!cfg || busy}
                />
              </label>
            </div>
          </div>

          <label className="block">
            <div className="text-xs font-medium text-text mb-1.5 ml-1">你的人设（Prompt Context）</div>
            <textarea
              className="w-full min-h-32 rounded-lg bg-white/50 backdrop-blur-sm border border-black/10 px-4 py-3 text-sm leading-relaxed focus:border-pink/50 focus:ring-4 focus:ring-pink/10 transition-all outline-none shadow-sm resize-none"
              value={personaText}
              onChange={(e) => setPersonaText(e.target.value)}
              disabled={!cfg || busy}
              placeholder="在这里描述你的性格、说话方式等，AI 会参考这些信息与你交流。"
            />
          </label>

          <div className="pt-2 flex justify-end">
            <button
              className="px-6 h-10 rounded-lg bg-pink text-white text-sm font-medium shadow-mac-active hover:bg-pink/90 active:scale-[0.98] transition-all"
              onClick={save}
              disabled={!cfg || busy}
            >
              {busy ? "保存中…" : "保存更改"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <GrainOverlay />
      <GradientBackground />
      <StitchDesktopShell activeNav="me" leftPane={leftPane} rightPane={rightPane} />
    </>
  );
}
