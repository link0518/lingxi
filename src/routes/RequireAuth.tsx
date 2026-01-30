import { Navigate, useLocation } from "react-router-dom";
import { loadApiConfig } from "../lib/api";

export function RequireAuth(props: { children: React.ReactNode }) {
  const location = useLocation();
  const cfg = loadApiConfig();
  if (!cfg) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{props.children}</>;
}

