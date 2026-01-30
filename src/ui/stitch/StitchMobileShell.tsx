import type { ReactNode } from "react";
import { GrainOverlay } from "../GrainOverlay";
import { GradientBackground } from "../GradientBackground";

type StitchMobileShellProps = {
  title?: string;
  topRight?: ReactNode;
  children: ReactNode;
  bottomNav?: ReactNode;
};

export function StitchMobileShell({
  title,
  topRight,
  children,
  bottomNav,
}: StitchMobileShellProps) {
  return (
    <div className="ui-page">
      <div className="relative h-dvh w-full bg-transparent flex flex-col overflow-hidden">
        <GrainOverlay />
        <GradientBackground />
        {(title || topRight) && (
          <header className="flex items-center justify-between px-5 py-3 bg-white/60 backdrop-blur-md border-b border-white/20 shrink-0 relative z-20">
            <h1 className="text-[18px] font-semibold text-text tracking-tight">{title}</h1>
            <div className="flex items-center gap-2">{topRight}</div>
          </header>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto ui-scrollbar relative z-10">{children}</div>

        {bottomNav ? <div className="shrink-0 relative z-20">{bottomNav}</div> : null}
      </div>
    </div>
  );
}
