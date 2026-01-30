import { Link } from "react-router-dom";
import { IconSparkles } from "./icons";

export function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="ui-card-subtle relative w-full max-w-md p-6">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-line bg-surface">
          <IconSparkles className="h-6 w-6 text-pink" />
        </div>
        <h3 className="mt-4 text-lg font-semibold">开始你们的第一句话</h3>
        <p className="mt-1 text-sm text-muted">
          选择一个角色，设置称呼与关系氛围，然后把想说的交给对话框。
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link className="ui-btn-primary h-11 px-5 text-sm" to="/characters">
            去选择角色
          </Link>
          <Link className="ui-btn-ghost h-11 px-5 text-sm" to="/settings">
            先调整偏好
          </Link>
        </div>
      </div>
    </div>
  );
}

