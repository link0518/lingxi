import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { StitchIcon } from "../ui/stitch/StitchIcon";
import { StitchDesktopShell } from "../ui/stitch/StitchDesktopShell";
import { StitchMobileShell } from "../ui/stitch/StitchMobileShell";
import { apiLogout, clearApiConfig, loadApiConfig } from "../lib/api";
import { WxTitleBar } from "../ui/WxTitleBar";
import { GrainOverlay } from "../ui/GrainOverlay";
import { GradientBackground } from "../ui/GradientBackground";

type SettingsSectionKey = "presets" | "backend" | "privacy" | "about";

function WxCell(props: { title: string; desc?: string; to?: string; disabled?: boolean; icon?: string; onClick?: () => void }) {
  const className = [
    "wx-list-item justify-between",
    props.disabled ? "opacity-50 pointer-events-none" : "active:bg-surface-2/70 hover:bg-surface-2/40 transition-colors",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      <div className="min-w-0 flex items-center gap-3">
        {props.icon ? (
          <div className="shrink-0 size-9 rounded-control bg-surface-2 border border-line flex items-center justify-center text-muted">
            <StitchIcon name={props.icon} className="text-[20px]" />
          </div>
        ) : null}
        <div className="min-w-0">
          <div className="text-[15px] font-medium text-text truncate">{props.title}</div>
          {props.desc ? <div className="mt-0.5 text-xs text-muted leading-5 truncate">{props.desc}</div> : null}
        </div>
      </div>
      <div className="shrink-0 text-muted">
        <StitchIcon name="chevron_right" className="text-[20px]" />
      </div>
    </>
  );

  if (props.onClick) {
    return (
      <button type="button" className={className} onClick={props.onClick}>
        {content}
      </button>
    );
  }

  return (
    <Link to={props.to ?? "#"} className={className}>
      {content}
    </Link>
  );
}

export function SettingsMenuPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const cfg = useMemo(() => loadApiConfig(), []);
  useState<SettingsSectionKey>("presets");
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(min-width: 900px)").matches;
  });

  const isChildRoute = useMemo(() => {
    return location.pathname.startsWith("/settings/") && location.pathname !== "/settings";
  }, [location.pathname]);

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

  if (!isDesktop) {
    if (isChildRoute) return <Outlet />;
    return (
      <StitchMobileShell title="">
        <WxTitleBar title="设置" backTo="/me" />
        <div className="px-5 py-3 text-sm text-muted">配置与偏好</div>
        <div className="wx-list">
          <WxCell title="提示词预设" desc="预设管理" to="/settings/presets" disabled={!cfg} icon="tune" />
          <WxCell title="API 设置" desc="配置模型网关 / Key / 模型" to="/settings/api" icon="tune" />
          {cfg?.role === "admin" ? (
            <WxCell title="管理面板" desc="系统管理" to="/admin" icon="admin_panel_settings" />
          ) : null}
          <WxCell
            title="退出登录"
            desc="返回登录页"
            icon="logout"
            onClick={() => {
              if (!cfg) return;
              void (async () => {
                try {
                  await apiLogout(cfg);
                } catch {
                  // ignore
                } finally {
                  clearApiConfig();
                  navigate("/login");
                }
              })();
            }}
          />
        </div>
      </StitchMobileShell>
    );
  }

  const leftPane = (
    <>
      <div className="px-5 pt-8 pb-4">
        <h2 className="text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-text to-text/70">设置</h2>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 space-y-2">
        {[
          {
            id: 'presets',
            title: '提示词预设',
            desc: '预设管理',
            icon: 'tune',
            disabled: !cfg,
            onClick: () => navigate("/settings/presets"),
            active: location.pathname.startsWith("/settings/presets")
          },
          {
            id: 'api',
            title: 'API 设置',
            desc: '配置模型网关 / Key / 模型',
            icon: 'settings_ethernet',
            onClick: () => navigate("/settings/api"),
            active: location.pathname.startsWith("/settings/api")
          },
          ...(cfg?.role === "admin"
            ? [{
              id: "admin",
              title: "管理面板",
              desc: "系统管理",
              icon: "admin_panel_settings",
              onClick: () => navigate("/admin"),
              active: location.pathname.startsWith("/admin")
            }]
            : [])
        ].map(item => (
          <button
            key={item.id}
            className={`w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${item.active
              ? "bg-white/10 border border-white/10 shadow-lg shadow-black/5 backdrop-blur-md"
              : "bg-transparent border border-transparent hover:bg-white/5 hover:border-white/5 active:scale-95"
              } ${item.disabled ? "opacity-50 pointer-events-none" : ""}`}
            onClick={item.onClick}
            disabled={item.disabled}
          >
            <div className={`shrink-0 size-10 rounded-lg flex items-center justify-center border transition-all ${item.active
              ? "bg-gradient-to-br from-pink/20 to-cta/20 border-pink/30 text-pink"
              : "bg-surface-2 border-white/10 text-muted/70"
              }`}>
              <StitchIcon name={item.icon} className="text-[20px]" />
            </div>

            <div className="min-w-0 flex-1">
              <div className={`text-[15px] font-semibold truncate ${item.active ? "text-text" : "text-text/80"}`}>{item.title}</div>
              <div className="text-xs text-muted/60 truncate">{item.desc}</div>
            </div>

            {/* Active Indicator */}
            {item.active && <StitchIcon name="chevron_right" className="text-pink/50 text-[18px]" />}
          </button>
        ))}
      </div>

      <div className="px-3 pb-5">
        <button
          className="w-full h-10 flex items-center justify-center gap-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-red-500 to-red-400 hover:from-red-600 hover:to-red-500 shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
          onClick={() => {
            if (!cfg) return;
            void (async () => {
              try {
                await apiLogout(cfg);
              } catch {
                // ignore
              } finally {
                clearApiConfig();
                navigate("/login");
              }
            })();
          }}
          disabled={!cfg}
        >
          <StitchIcon name="logout" className="text-lg" />
          退出登录
        </button>
      </div>
    </>
  );

  const rightPane = (
    <div className="flex-1 min-h-0 overflow-y-auto bg-white/30">
      <div className="p-6 max-w-[760px]">
        <div className="text-lg font-semibold text-text">设置</div>
        <div className="mt-2 text-sm text-muted leading-6">从左侧选择一个设置项。</div>
      </div>
    </div>
  );

  return (
    <>
      <GrainOverlay />
      <GradientBackground />
      <StitchDesktopShell activeNav={undefined} leftPane={leftPane} rightPane={isChildRoute ? <Outlet /> : rightPane} />
    </>
  );
}
