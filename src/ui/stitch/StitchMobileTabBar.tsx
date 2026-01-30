import { Link, useLocation } from "react-router-dom";
import { StitchIcon } from "./StitchIcon";

type TabItem = {
  to: string;
  label: string;
  icon: string;
  fillIcon?: string;
};

const tabs: TabItem[] = [
  { to: "/messages", label: "聊天", icon: "chat_bubble_outline", fillIcon: "chat_bubble" },
  { to: "/contacts", label: "通讯录", icon: "group", fillIcon: "people" },
  { to: "/moments", label: "发现", icon: "explore", fillIcon: "explore" },
  { to: "/me", label: "我的", icon: "person", fillIcon: "person" },
];

export function StitchMobileTabBar() {
  const { pathname } = useLocation();

  return (
    <nav className="w-full bg-white/70 backdrop-blur-xl border-t border-white/20 h-[84px] pb-[calc(env(safe-area-inset-bottom)+10px)] flex items-center justify-around shadow-lg shadow-black/5">
      {tabs.map((tab) => {
        const active = pathname === tab.to;
        const iconName = active ? tab.fillIcon ?? tab.icon : tab.icon;

        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={[
              "flex flex-col items-center justify-center gap-1 w-16 transition-colors",
              active ? "text-cta" : "text-muted hover:text-text",
            ].join(" ")}
          >
            <StitchIcon name={iconName} className="text-[26px]" fill={active ? 1 : 0} />
            <span className={["text-[10px]", active ? "font-bold" : "font-medium"].join(" ")}>
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
