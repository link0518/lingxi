import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

type WxTitleBarProps = {
  title: string;
  backTo?: string;
  right?: ReactNode;
};

export function WxTitleBar({ title, backTo, right }: WxTitleBarProps) {
  const navigate = useNavigate();
  return (
    <header className="wx-titlebar bg-white/60 backdrop-blur-md border-b border-white/20">
      <div className="wx-titlebar-inner">
        {backTo ? (
          <button type="button" className="ui-btn-ghost h-9 px-3 text-sm" onClick={() => navigate(backTo)}>
            返回
          </button>
        ) : (
          <div className="w-16" />
        )}
        <div className="text-[16px] font-semibold text-text">{title}</div>
        <div className="w-16 flex justify-end">{right ?? null}</div>
      </div>
    </header>
  );
}
