import { Navigate } from "react-router-dom";
import { loadApiConfig } from "../lib/api";

export function RequireAdmin(props: { children: React.ReactNode }) {
  const cfg = loadApiConfig();
  if (!cfg) return <Navigate to="/login" replace />;
  if (cfg.role !== "admin") return <Navigate to="/messages" replace />;
  return <>{props.children}</>;
}

