import { Outlet } from "react-router-dom";

export function AppShell() {
  return (
    <div className="ui-page">
      <Outlet />
    </div>
  );
}
