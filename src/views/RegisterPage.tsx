import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
/* Avatar removed */
import { apiRegister, isLoggedIn, saveApiConfig } from "../lib/api";
import { runtimeConfig } from "../lib/runtimeConfig";

import { GradientBackground } from "../ui/GradientBackground";
import { GrainOverlay } from "../ui/GrainOverlay";

export function RegisterPage() {
  const navigate = useNavigate();
  useMemo(() => null, []);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) return;
    navigate("/messages", { replace: true });
  }, [navigate]);

  async function doRegister() {
    setError(null);
    setBusy(true);
    try {
      if (!username.trim()) throw new Error("请输入用户名");
      if (!password) throw new Error("请输入密码");
      if (!inviteCode.trim()) throw new Error("请输入邀请码");

      const res = await apiRegister({ baseUrl: runtimeConfig.apiBaseUrl, username, password, inviteCode });
      if (!res.ok || !res.token || !res.userId) {
        const msg =
          res.error === "username_taken"
            ? "用户名已被占用"
            : res.error === "invite_code_invalid"
              ? "邀请码无效或已被使用"
              : "注册失败";
        throw new Error(msg);
      }

      saveApiConfig({ baseUrl: runtimeConfig.apiBaseUrl, authToken: res.token, userId: res.userId });
      navigate("/messages", { replace: true });
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
                  <h2 className="text-2xl font-bold tracking-tight text-text">加入灵犀</h2>
                  <p className="text-sm text-muted/80 mt-1">开启您的 AI 伴侣之旅</p>
                </div>
                <button
                  type="button"
                  className="rounded-full px-4 py-1.5 text-xs font-medium text-text bg-white/5 border border-white/10 hover:bg-white/10 transition-colors backdrop-blur-sm"
                  onClick={() => navigate("/login")}
                  disabled={busy}
                >
                  去登录
                </button>
              </div>

              {/* Avatar removed for consistency */}

              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted uppercase tracking-wider ml-1">用户名</label>
                  <input
                    className="block w-full rounded-xl border border-white/10 bg-black/5 px-4 py-3 text-text placeholder:text-muted/40 focus:border-cta/50 focus:bg-white/5 focus:outline-none focus:ring-1 focus:ring-cta/50 transition-all shadow-inner"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="2-32 位（建议英文/数字）"
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted uppercase tracking-wider ml-1">密码</label>
                  <input
                    className="block w-full rounded-xl border border-white/10 bg-black/5 px-4 py-3 text-text placeholder:text-muted/40 focus:border-cta/50 focus:bg-white/5 focus:outline-none focus:ring-1 focus:ring-cta/50 transition-all shadow-inner"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="至少 6 位"
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted uppercase tracking-wider ml-1">邀请码</label>
                  <input
                    className="block w-full rounded-xl border border-white/10 bg-black/5 px-4 py-3 text-text placeholder:text-muted/40 focus:border-cta/50 focus:bg-white/5 focus:outline-none focus:ring-1 focus:ring-cta/50 transition-all shadow-inner"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="例如：ABCD2345"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button className="h-11 w-full rounded-xl bg-gradient-to-r from-pink to-cta text-white font-medium shadow-lg shadow-pink/25 hover:shadow-pink/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-200" onClick={() => void doRegister()} disabled={busy}>
                    {busy ? "注册中..." : "注册并进入"}
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
