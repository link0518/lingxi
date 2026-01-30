import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { StitchIcon } from "./StitchIcon";
import { useEffect, useMemo, useState } from "react";
import { apiGetMe, assetUrl, loadApiConfig } from "../../lib/api";

type StitchDesktopShellProps = {
  activeNav?: "messages" | "contacts" | "moments" | "me";
  leftPane: ReactNode;
  rightPane: ReactNode;
};

export function StitchDesktopShell({ activeNav, leftPane, rightPane }: StitchDesktopShellProps) {
  const cfg = useMemo(() => loadApiConfig(), []);
  const [meAvatar, setMeAvatar] = useState<string>("");
  const [meName, setMeName] = useState<string>("");

  useEffect(() => {
    if (!cfg) return;
    (async () => {
      try {
        const me = await apiGetMe(cfg);
        setMeAvatar(me.avatarUrl || "");
        setMeName(me.displayName || "");
      } catch {
        // ignore
      }
    })();
  }, [cfg]);

  const navBtn =
    "group flex items-center justify-center w-10 h-10 rounded-lg text-muted transition-all duration-200 hover:bg-black/5 hover:text-text active:scale-95";
  const navBtnActive =
    "group flex items-center justify-center w-10 h-10 rounded-lg bg-pink text-white shadow-mac-active relative active:scale-95";

  const iconClass = "text-[24px]";
  const navIcon = (name: string, active?: boolean) => (
    <StitchIcon name={name} className={iconClass} fill={active ? 1 : 0} />
  );

  return (
    <div className="ui-page min-h-dvh w-full overflow-hidden flex items-center justify-center bg-[#F2F2F7] mac-noise">
      {/* 桌面端：模拟真实 macOS 窗口 (Visual Physics) */}
      <div className="mac-window w-full max-w-[1200px] h-[85dvh] min-h-[700px] flex rounded-xl border border-white/20">

        {/* Sidebar (Glassy Material) */}
        <nav className="mac-sidebar w-[70px] flex-shrink-0 flex flex-col items-center py-5 z-20 relative">
          {/* Traffic Lights (Visual only, simulates window controls) */}
          <div className="absolute top-4 left-0 w-full flex justify-center gap-[8px] mb-6">
            {/* Traffic Lights removed as requested */}
          </div>

          <div className="mt-12 mb-6">
            <div className="relative group cursor-pointer">
              {meAvatar ? (
                <img
                  alt={meName || "我"}
                  src={cfg ? assetUrl(cfg.baseUrl, meAvatar) : meAvatar}
                  className="rounded-lg w-10 h-10 object-cover bg-surface-2 shadow-sm border border-black/10 group-hover:opacity-90 transition-all"
                />
              ) : (
                <div className="bg-surface-2 rounded-lg w-10 h-10 border border-black/10 flex items-center justify-center text-xs font-bold text-muted">我</div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4 w-full items-center">
            <Link className={activeNav === "messages" ? navBtnActive : navBtn} to="/messages" aria-label="消息">
              {navIcon("chat_bubble", activeNav === "messages")}
            </Link>
            <Link className={activeNav === "contacts" ? navBtnActive : navBtn} to="/contacts" aria-label="通讯录">
              {navIcon("group", activeNav === "contacts")}
            </Link>
            <Link className={activeNav === "moments" ? navBtnActive : navBtn} to="/moments" aria-label="朋友圈">
              {navIcon("explore", activeNav === "moments")}
            </Link>
            <Link className={activeNav === "me" ? navBtnActive : navBtn} to="/me" aria-label="我的">
              {navIcon("person", activeNav === "me")}
            </Link>
          </div>

          <div className="mt-auto flex flex-col gap-4 w-full items-center pb-2">
            <Link className={navBtn} to="/settings" aria-label="设置">
              <StitchIcon name="settings" className={iconClass} />
            </Link>
          </div>
        </nav>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0 flex bg-white/50 backdrop-blur-sm">
          {/* Secondary Sidebar (List List) */}
          <aside className="w-[320px] flex-shrink-0 flex flex-col border-r border-black/5 bg-transparent z-10">
            {leftPane}
          </aside>
          {/* Right Pane (Chat/Detail) */}
          <main className="flex-1 min-w-0 flex flex-col bg-white relative">
            {/* Top inner highlight for the content area */}
            <div className="absolute inset-x-0 top-0 h-px bg-white/50 z-10 pointer-events-none"></div>
            {rightPane}
          </main>
        </div>
      </div>
    </div>
  );
}
