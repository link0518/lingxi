import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
/* Avatar removed */
import { apiLogin, isLoggedIn, loadApiConfig, saveApiConfig } from "../lib/api";
import { runtimeConfig } from "../lib/runtimeConfig";

import { GradientBackground } from "../ui/GradientBackground";
import { GrainOverlay } from "../ui/GrainOverlay";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  useMemo(() => loadApiConfig(), []);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) return;
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from && from !== "/login" ? from : "/messages", { replace: true });
  }, [location.state, navigate]);

  async function doLogin() {
    setError(null);
    setBusy(true);
    try {
      if (!username.trim()) throw new Error("请输入用户名");
      if (!password) throw new Error("请输入密码");

      const baseUrl = runtimeConfig.apiBaseUrl;
      const res = await apiLogin({ baseUrl, username, password });
      if (!res.ok || !res.token || !res.userId) {
        const msg = res.error === "invalid_credentials" ? "用户名或密码不正确" : "登录失败";
        throw new Error(msg);
      }
      saveApiConfig({ baseUrl, authToken: res.token, userId: res.userId, role: res.role });
      const from = (location.state as { from?: string } | null)?.from;
      const targetPath = from && from !== "/login" ? from : "/messages";
      navigate(targetPath, { replace: true });
    } catch (e: unknown) {
      const err = e as { message?: unknown };
      setError(String(err?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ui-page relative overflow-hidden">
      <GrainOverlay />
      <GradientBackground />
      <div className="relative mx-auto flex min-h-dvh max-w-6xl items-center justify-center px-6 py-10">
        <div className="relative z-10 w-full max-w-md">
          {/* Star-light border effect */}
          <div className="absolute -inset-[1px] rounded-3xl bg-gradient-to-b from-white/40 to-white/5 opacity-50 blur-[2px]" />

          <div className="ui-hero-card relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-2xl transition-all duration-500 hover:shadow-cta/10">
            {/* Subtle inner gloss */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-50 pointer-events-none" />

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-text">欢迎回来</h2>
                  <p className="text-sm text-muted/80 mt-1">登录以继续您的旅程</p>
                </div>
                <button
                  type="button"
                  className="rounded-full px-4 py-1.5 text-xs font-medium text-text bg-white/5 border border-white/10 hover:bg-white/10 transition-colors backdrop-blur-sm"
                  onClick={() => navigate("/register")}
                  disabled={busy}
                >
                  注册账号
                </button>
              </div>

              {/* Avatar removed as requested */}

              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted uppercase tracking-wider ml-1">用户名</label>
                  <input
                    className="block w-full rounded-xl border border-white/10 bg-black/5 px-4 py-3 text-text placeholder:text-muted/40 focus:border-cta/50 focus:bg-white/5 focus:outline-none focus:ring-1 focus:ring-cta/50 transition-all shadow-inner"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="请输入用户名"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted uppercase tracking-wider ml-1">密码</label>
                  <input
                    className="block w-full rounded-xl border border-white/10 bg-black/5 px-4 py-3 text-text placeholder:text-muted/40 focus:border-cta/50 focus:bg-white/5 focus:outline-none focus:ring-1 focus:ring-cta/50 transition-all shadow-inner"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="请输入密码"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button className="h-11 w-full rounded-xl bg-gradient-to-r from-cta to-pink text-white font-medium shadow-lg shadow-cta/25 hover:shadow-cta/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-200" onClick={doLogin} disabled={busy}>
                    {busy ? "登录中..." : "登录"}
                  </button>
                </div>

                {error ? (
                  <div className="mt-4 rounded-xl border border-red-200/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 backdrop-blur-sm animate-fade-in-up">
                    {error}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
