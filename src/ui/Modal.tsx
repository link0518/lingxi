import { useEffect, useId } from "react";

type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
};

export function Modal(props: ModalProps) {
  const { open, title, onClose, children, className } = props;
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200]">
      <button className="absolute inset-0 bg-black/30" onClick={onClose} aria-label="关闭弹窗" />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={[
            "w-full max-w-lg rounded-2xl border border-line bg-surface shadow-soft",
            "p-5",
            "max-h-[calc(100dvh-2rem)] overflow-y-auto ui-scrollbar",
            className ?? "",
          ].join(" ")}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div id={titleId} className="text-base font-semibold text-text">
                {title}
              </div>
            </div>
            <button className="ui-btn-ghost h-9 px-3 text-sm" onClick={onClose}>
              关闭
            </button>
          </div>

          <div className="mt-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

