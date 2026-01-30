import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  apiAdminCreateInviteCodes,
  apiAdminListInviteCodes,
  apiAdminGetSessionMessages,
  apiAdminListUserSessions,
  apiAdminListUsers,
  apiAdminSetUserPassword,
  apiAdminGetAffectionStages,
  apiAdminSetAffectionStages,
  apiAdminGetAffectionTuning,
  apiAdminSetAffectionTuning,
  apiChangePassword,
  loadApiConfig,
} from "../lib/api";
import { StitchIcon } from "../ui/stitch/StitchIcon";
import { StitchDesktopShell } from "../ui/stitch/StitchDesktopShell";
import { StitchMobileShell } from "../ui/stitch/StitchMobileShell";
import { StitchMobileTabBar } from "../ui/stitch/StitchMobileTabBar";
import { GrainOverlay } from "../ui/GrainOverlay";
import { GradientBackground } from "../ui/GradientBackground";
import { WxTitleBar } from "../ui/WxTitleBar";

type UserRow = { accountId: string; userId: string; username: string; role: "user" | "admin"; createdAt: string };
type SessionRow = { id: string; userId: string; characterId: string; characterName: string; createdAt: string };
type MessageRow = { id: string; role: "user" | "assistant"; content: string; createdAt: string };

type AdminTab = "invite" | "password" | "users" | "affection";

export function AdminPage() {
  const cfg = useMemo(() => loadApiConfig(), []);
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(min-width: 900px)").matches;
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<AdminTab>("invite");

  const [inviteCount, setInviteCount] = useState(1);
  const [inviteCodes, setInviteCodes] = useState<Array<{ code: string; createdAt: string; usedAt: string | null }>>([]);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [users, setUsers] = useState<UserRow[]>([]);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);

  const [targetAccountId, setTargetAccountId] = useState("");
  const [targetNewPassword, setTargetNewPassword] = useState("");

  const [affectionStages, setAffectionStages] = useState<Array<{ key: string; label: string; minScore: number; nsfw: "none" | "light" | "normal" | "full"; prompt?: string }>>([]);
  const [affectionTuning, setAffectionTuning] = useState<{
    initScore: number;
    clampMin: number;
    clampMax: number;
    hourlyCapPos: number;
    hourlyCapNeg: number;
    scoreMin: number;
    scoreMax: number;
    ruleWeights: Record<string, number>;
  } | null>(null);
  const defaultTuning = {
    initScore: 20,
    clampMin: -8,
    clampMax: 6,
    hourlyCapPos: 8,
    hourlyCapNeg: 12,
    scoreMin: 0,
    scoreMax: 100,
    ruleWeights: {
      gratitude: 1.0,
      warmth: 0.8,
      apology: 0.6,
      affection: 1.2,
      respect: 0.5,
      dismissive: -0.8,
      rude: -1.5,
      hostile: -2.5,
    },
  };

  const ruleLabelMap: Record<string, string> = {
    gratitude: "感谢",
    warmth: "温暖",
    apology: "道歉",
    affection: "亲昵",
    respect: "尊重",
    dismissive: "冷淡",
    rude: "粗鲁",
    hostile: "敌意",
    commitment: "承诺",
    self_disclosure: "自我披露",
    boundary_push: "越界",
  };

  async function refreshAffectionStages() {
    if (!cfg) return;
    try {
      const data = await apiAdminGetAffectionStages(cfg);
      if (data?.stages && Array.isArray(data.stages)) {
        setAffectionStages(data.stages);
      }
    } catch {
      // ignore
    }
  }

  async function refreshAffectionTuning() {
    if (!cfg) return;
    try {
      const data = await apiAdminGetAffectionTuning(cfg);
      if (data?.tuning) {
        setAffectionTuning({
          ...defaultTuning,
          ...data.tuning,
          ruleWeights: { ...defaultTuning.ruleWeights, ...(data.tuning.ruleWeights ?? {}) },
        });
      } else {
        setAffectionTuning(defaultTuning);
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const m = window.matchMedia("(min-width: 900px)");
    const onChange = () => setIsDesktop(m.matches);
    onChange();
    const legacy = m as MediaQueryList & { addListener?: (cb: () => void) => void; removeListener?: (cb: () => void) => void };
    if ("addEventListener" in m) m.addEventListener("change", onChange);
    else legacy.addListener?.(onChange);
    return () => {
      if ("removeEventListener" in m) m.removeEventListener("change", onChange);
      else legacy.removeListener?.(onChange);
    };
  }, []);

  async function refreshUsers() {
    if (!cfg) return;
    setError(null);
    try {
      const data = await apiAdminListUsers(cfg);
      setUsers(data.users ?? []);
      if (!activeUserId && data.users?.[0]?.userId) setActiveUserId(data.users[0].userId);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void refreshUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg]);

  useEffect(() => {
    if (!cfg) return;
    if (!activeUserId) return;
    setError(null);
    setSessions([]);
    setActiveSessionId(null);
    setMessages([]);
    void (async () => {
      try {
        const data = await apiAdminListUserSessions(cfg, activeUserId);
        setSessions(data.sessions ?? []);
        setActiveSessionId(data.sessions?.[0]?.id ?? null);
      } catch (e: unknown) {
        const err = e as { message?: unknown };
        setError(String(err?.message ?? e));
      }
    })();
  }, [activeUserId, cfg]);

  useEffect(() => {
    if (!cfg) return;
    if (!activeSessionId) return;
    setError(null);
    setMessages([]);
    void (async () => {
      try {
        const data = await apiAdminGetSessionMessages(cfg, activeSessionId);
        setMessages(data.messages ?? []);
      } catch (e: unknown) {
        const err = e as { message?: unknown };
        setError(String(err?.message ?? e));
      }
    })();
  }, [activeSessionId, cfg]);

  const refreshInviteCodes = useCallback(async () => {
    if (!cfg) return;
    try {
      const data = await apiAdminListInviteCodes(cfg);
      setInviteCodes(data.codes ?? []);
    } catch {
      // ignore
    }
  }, [cfg]);

  useEffect(() => {
    if (activeTab === "invite") {
      void refreshInviteCodes();
    }
    if (activeTab === "affection") {
      void refreshAffectionStages();
      void refreshAffectionTuning();
    }
  }, [activeTab, refreshInviteCodes]);

  async function createInvites() {
    if (!cfg) return;
    setError(null);
    setOk(null);
    setBusy(true);
    try {
      await apiAdminCreateInviteCodes(cfg, { count: inviteCount });
      await refreshInviteCodes();
      setOk("已生成邀请码");
    } catch (e: unknown) {
      const err = e as { message?: unknown };
      setError(String(err?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function changeMyPassword() {
    if (!cfg) return;
    setError(null);
    setOk(null);
    setBusy(true);
    try {
      const data = await apiChangePassword(cfg, { oldPassword, newPassword });
      if (!data.ok) throw new Error(data.error || "修改失败");
      setOk("密码已修改");
      setOldPassword("");
      setNewPassword("");
    } catch (e: unknown) {
      const err = e as { message?: unknown };
      setError(String(err?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function setUserPassword() {
    if (!cfg) return;
    setError(null);
    setOk(null);
    setBusy(true);
    try {
      if (!targetAccountId.trim()) throw new Error("请输入 accountId");
      if (!targetNewPassword) throw new Error("请输入新密码");
      const data = await apiAdminSetUserPassword(cfg, targetAccountId.trim(), { newPassword: targetNewPassword });
      if (!data.ok) throw new Error(data.error || "修改失败");
      setOk("已为用户设置新密码");
      setTargetNewPassword("");
    } catch (e: unknown) {
      const err = e as { message?: unknown };
      setError(String(err?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setOk("已复制到剪贴板");
      setTimeout(() => setOk(null), 1500);
    }).catch(() => {
      setError("复制失败");
    });
  }

  function formatAdminTime(raw?: string) {
    if (!raw) return "";
    const normalized = raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`;
    const d = new Date(normalized);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  // ===== 右栏内容面板 =====
  const invitePanel = (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-text mb-1">生成邀请码</h3>
        <p className="text-sm text-muted">生成邀请码供新用户注册时使用</p>
      </div>

      <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-line/40 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-text/80 shrink-0">生成数量</label>
          <input
            className="w-24 h-11 px-4 rounded-xl border border-line/50 bg-white/80 text-text text-center focus:outline-none focus:border-pink/40 focus:ring-2 focus:ring-pink/10 transition-all"
            type="number"
            min={1}
            max={50}
            value={inviteCount}
            onChange={(e) => setInviteCount(Number(e.target.value))}
          />
          <button
            className="h-11 px-6 rounded-xl bg-gradient-to-r from-cta to-pink text-white text-sm font-medium shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
            onClick={() => void createInvites()}
            disabled={busy}
          >
            {busy ? "生成中…" : "生成邀请码"}
          </button>
        </div>
      </div>

      {inviteCodes.length > 0 && (
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-line/40 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-text/80">已生成的邀请码</div>
            <button
              className="text-xs text-cta hover:text-pink transition-colors"
              onClick={() => copyToClipboard(inviteCodes.map(x => x.code).join("\n"))}
            >
              一键复制全部
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {inviteCodes.map((item) => (
              <div
                key={item.code}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-line/50 bg-surface-2/30 hover:bg-surface-2/60 transition-colors cursor-pointer group"
                onClick={() => copyToClipboard(item.code)}
              >
                <div className="flex flex-col">
                  <span className="font-mono text-sm text-text">{item.code}</span>
                  <span className="text-[10px] text-muted/50">{new Date(item.createdAt).toLocaleDateString()}</span>
                </div>
                <StitchIcon name="content_copy" className="text-muted/40 group-hover:text-cta text-sm transition-colors" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const passwordPanel = (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-text mb-1">密码管理</h3>
        <p className="text-sm text-muted">修改自己的密码或为其他用户重置密码</p>
      </div>

      <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-line/40 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-text/80">
          <StitchIcon name="lock" className="text-lg" />
          修改我的密码
        </div>
        <div className="space-y-3">
          <input
            className="w-full h-11 px-4 rounded-xl border border-line/50 bg-white/80 text-text placeholder:text-muted/50 focus:outline-none focus:border-pink/40 focus:ring-2 focus:ring-pink/10 transition-all"
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            placeholder="旧密码"
          />
          <input
            className="w-full h-11 px-4 rounded-xl border border-line/50 bg-white/80 text-text placeholder:text-muted/50 focus:outline-none focus:border-pink/40 focus:ring-2 focus:ring-pink/10 transition-all"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="新密码（至少 6 位）"
          />
          <button
            className="h-11 px-6 rounded-xl bg-gradient-to-r from-cta to-pink text-white text-sm font-medium shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
            onClick={() => void changeMyPassword()}
            disabled={busy}
          >
            {busy ? "提交中…" : "确认修改"}
          </button>
        </div>
      </div>

      <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-line/40 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-text/80">
          <StitchIcon name="admin_panel_settings" className="text-lg" />
          为用户设置新密码
        </div>
        <div className="space-y-3">
          <input
            className="w-full h-11 px-4 rounded-xl border border-line/50 bg-white/80 text-text placeholder:text-muted/50 focus:outline-none focus:border-pink/40 focus:ring-2 focus:ring-pink/10 transition-all"
            value={targetAccountId}
            onChange={(e) => setTargetAccountId(e.target.value)}
            placeholder="accountId（在用户列表里复制）"
          />
          <input
            className="w-full h-11 px-4 rounded-xl border border-line/50 bg-white/80 text-text placeholder:text-muted/50 focus:outline-none focus:border-pink/40 focus:ring-2 focus:ring-pink/10 transition-all"
            type="password"
            value={targetNewPassword}
            onChange={(e) => setTargetNewPassword(e.target.value)}
            placeholder="新密码（至少 6 位）"
          />
          <button
            className="h-11 px-6 rounded-xl bg-gradient-to-r from-cta to-pink text-white text-sm font-medium shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
            onClick={() => void setUserPassword()}
            disabled={busy}
          >
            {busy ? "提交中…" : "设置密码"}
          </button>
        </div>
      </div>
    </div>
  );

  const usersPanel = (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-text mb-1">用户与聊天记录</h3>
          <p className="text-sm text-muted">查看所有用户的会话和聊天内容</p>
        </div>
        <button
          className="h-9 px-4 rounded-lg border border-line/60 bg-white/80 text-text text-sm hover:bg-surface-2/80 transition-all"
          onClick={() => void refreshUsers()}
          disabled={busy}
        >
          刷新
        </button>
      </div>

      {/* 用户和会话列表 - 紧凑横向布局 */}
      <div className="flex gap-3 h-48">
        {/* 用户列表 */}
        <div className="flex-1 bg-white/60 backdrop-blur-sm rounded-xl border border-line/40 shadow-sm overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-line/20 bg-surface-2/20 shrink-0">
            <span className="text-xs font-medium text-muted">用户 ({users.length})</span>
          </div>
          <div className="flex-1 overflow-auto ui-scrollbar">
            {users.map((u) => {
              const active = u.userId === activeUserId;
              return (
                <button
                  key={u.accountId}
                  type="button"
                  className={`w-full text-left px-3 py-2 border-b border-line/10 transition-all flex items-center justify-between gap-2 ${active ? "bg-pink/5" : "hover:bg-surface-2/30"}`}
                  onClick={() => setActiveUserId(u.userId)}
                >
                  <div className="min-w-0 flex-1">
                    <span className={`text-sm truncate ${active ? "font-semibold text-text" : "text-text/80"}`}>{u.username}</span>
                  </div>
                  <span className={u.role === "admin" ? "px-1.5 py-0.5 rounded text-[9px] font-medium bg-cta/10 text-cta shrink-0" : "px-1.5 py-0.5 rounded text-[9px] font-medium bg-muted/10 text-muted/60 shrink-0"}>
                    {u.role}
                  </span>
                </button>
              );
            })}
            {users.length === 0 && <div className="text-xs text-muted p-3 text-center">暂无用户</div>}
          </div>
        </div>

        {/* 会话列表 */}
        <div className="flex-1 bg-white/60 backdrop-blur-sm rounded-xl border border-line/40 shadow-sm overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-line/20 bg-surface-2/20 shrink-0">
            <span className="text-xs font-medium text-muted">会话 ({sessions.length})</span>
          </div>
          <div className="flex-1 overflow-auto ui-scrollbar">
            {sessions.map((s) => {
              const active = s.id === activeSessionId;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`w-full text-left px-3 py-2 border-b border-line/10 transition-all ${active ? "bg-pink/5" : "hover:bg-surface-2/30"}`}
                  onClick={() => setActiveSessionId(s.id)}
                >
                  <div className={`text-sm truncate ${active ? "font-semibold text-text" : "text-text/80"}`}>{s.characterName}</div>
                  <div className="text-[10px] text-muted/50 truncate">ID: {s.id.slice(0, 12)}...</div>
                </button>
              );
            })}
            {sessions.length === 0 && <div className="text-xs text-muted p-3 text-center">该用户暂无会话</div>}
          </div>
        </div>
      </div>

      {/* 聊天记录 - 对话气泡样式 */}
      <div className="bg-white/60 backdrop-blur-sm rounded-xl border border-line/40 shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-line/20 bg-surface-2/20 flex items-center justify-between">
          <span className="text-xs font-medium text-muted">聊天记录</span>
          <span className="text-[10px] text-muted/50">{messages.length} 条消息</span>
        </div>
        <div className="h-80 overflow-auto ui-scrollbar px-4 py-3 bg-gradient-to-b from-surface/20 to-bg/30">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted/40 gap-2">
              <StitchIcon name="chat_bubble_outline" className="text-3xl" />
              <span className="text-xs">请选择一个会话查看消息</span>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((m) => {
                const isUser = m.role === "user";
                return (
                  <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] ${isUser ? "order-2" : "order-1"}`}>
                      <div className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${isUser ? "bg-gradient-to-br from-cta to-pink text-white rounded-tr-sm" : "bg-white border border-line/30 text-text rounded-tl-sm shadow-sm"}`}>
                        {m.content}
                      </div>
                      <div className={`mt-1 text-[9px] text-muted/40 ${isUser ? "text-right" : "text-left"}`}>
                        {formatAdminTime(m.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const affectionPanel = (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-text mb-1">好感度系统</h3>
          <p className="text-sm text-muted">每条消息更新，规则 + 任务模型混合评分。</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="ui-btn-ghost h-10 px-4 text-sm"
            onClick={() => setAffectionTuning({
              initScore: 20,
              clampMin: -8,
              clampMax: 6,
              hourlyCapPos: 8,
              hourlyCapNeg: 12,
              scoreMin: 0,
              scoreMax: 100,
              ruleWeights: {
                gratitude: 1.0,
                warmth: 0.8,
                apology: 0.6,
                affection: 1.2,
                respect: 0.5,
                dismissive: -0.8,
                rude: -1.5,
                hostile: -2.5,
              },
            })}
          >
            恢复默认
          </button>
          <button
            className="ui-btn-primary h-10 px-4 text-sm"
            onClick={async () => {
              if (!cfg || !affectionTuning) return;
              setError(null);
              setOk(null);
              setBusy(true);
              try {
                const payload = {
                  ...defaultTuning,
                  ...affectionTuning,
                  ruleWeights: { ...defaultTuning.ruleWeights, ...(affectionTuning.ruleWeights ?? {}) },
                };
                await apiAdminSetAffectionTuning(cfg, payload);
                setOk("好感度算法已保存");
              } catch (e: unknown) {
                const err = e as { message?: unknown };
                setError(String(err?.message ?? e));
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy || !affectionTuning}
          >
            {busy ? "保存中…" : "保存算法"}
          </button>
          <button
            className="ui-btn-primary h-10 px-4 text-sm"
            onClick={async () => {
              if (!cfg) return;
              setError(null);
              setOk(null);
              setBusy(true);
              try {
                const sorted = [...affectionStages].sort((a, b) => a.minScore - b.minScore);
                await apiAdminSetAffectionStages(cfg, sorted);
                setOk("阶段配置已保存");
              } catch (e: unknown) {
                const err = e as { message?: unknown };
                setError(String(err?.message ?? e));
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
          >
            {busy ? "保存中…" : "保存阶段"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-1 space-y-4">
          <div className="bg-white/60 backdrop-blur-sm rounded-xl border border-line/40 shadow-sm p-5 space-y-4">
            <div className="text-xs font-semibold text-text/80">评分与上限</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-muted">
                初始分
                <input
                  className="mt-1 w-24 h-6 rounded-lg border border-line/50 bg-white/80 px-2 text-xs text-text"
                  type="number"
                  value={affectionTuning?.initScore ?? 20}
                  onChange={(e) => setAffectionTuning((prev) => ({ ...(prev ?? {} as any), initScore: Number(e.target.value) }))}
                />
              </label>
              <label className="text-[11px] text-muted">
                单次下限
                <input
                  className="mt-1 w-24 h-6 rounded-lg border border-line/50 bg-white/80 px-2 text-xs text-text"
                  type="number"
                  value={affectionTuning?.clampMin ?? -8}
                  onChange={(e) => setAffectionTuning((prev) => ({ ...(prev ?? {} as any), clampMin: Number(e.target.value) }))}
                />
              </label>
              <label className="text-[11px] text-muted">
                单次上限
                <input
                  className="mt-1 w-24 h-6 rounded-lg border border-line/50 bg-white/80 px-2 text-xs text-text"
                  type="number"
                  value={affectionTuning?.clampMax ?? 6}
                  onChange={(e) => setAffectionTuning((prev) => ({ ...(prev ?? {} as any), clampMax: Number(e.target.value) }))}
                />
              </label>
              <label className="text-[11px] text-muted">
                正向/小时
                <input
                  className="mt-1 w-24 h-6 rounded-lg border border-line/50 bg-white/80 px-2 text-xs text-text"
                  type="number"
                  value={affectionTuning?.hourlyCapPos ?? 8}
                  onChange={(e) => setAffectionTuning((prev) => ({ ...(prev ?? {} as any), hourlyCapPos: Number(e.target.value) }))}
                />
              </label>
              <label className="text-[11px] text-muted">
                负向/小时
                <input
                  className="mt-1 w-24 h-6 rounded-lg border border-line/50 bg-white/80 px-2 text-xs text-text"
                  type="number"
                  value={affectionTuning?.hourlyCapNeg ?? 12}
                  onChange={(e) => setAffectionTuning((prev) => ({ ...(prev ?? {} as any), hourlyCapNeg: Number(e.target.value) }))}
                />
              </label>
              <label className="text-[11px] text-muted">
                总分下限
                <input
                  className="mt-1 w-24 h-6 rounded-lg border border-line/50 bg-white/80 px-2 text-xs text-text"
                  type="number"
                  value={affectionTuning?.scoreMin ?? 0}
                  onChange={(e) => setAffectionTuning((prev) => ({ ...(prev ?? {} as any), scoreMin: Number(e.target.value) }))}
                />
              </label>
              <label className="text-[11px] text-muted">
                总分上限
                <input
                  className="mt-1 w-24 h-6 rounded-lg border border-line/50 bg-white/80 px-2 text-xs text-text"
                  type="number"
                  value={affectionTuning?.scoreMax ?? 100}
                  onChange={(e) => setAffectionTuning((prev) => ({ ...(prev ?? {} as any), scoreMax: Number(e.target.value) }))}
                />
              </label>
            </div>
          </div>

          <div className="bg-white/60 backdrop-blur-sm rounded-xl border border-line/40 shadow-sm p-5 space-y-4">
            <div className="text-xs font-semibold text-text/80">规则权重</div>
            <div className="text-[11px] text-muted">正数加分，负数扣分。</div>
            <div className="space-y-1.5">
              {Object.entries(affectionTuning?.ruleWeights ?? {}).map(([k, v]) => (
                <label key={k} className="flex items-center gap-3 text-[11px] text-muted">
                  <span className="w-20">{ruleLabelMap[k] ?? k}</span>
                  <input
                    className="w-20 h-6 rounded-lg border border-line/50 bg-white/80 px-2 text-xs text-text"
                    type="number"
                    value={v}
                    onChange={(e) => setAffectionTuning((prev) => ({
                      ...(prev ?? {} as any),
                      ruleWeights: { ...(prev?.ruleWeights ?? {}), [k]: Number(e.target.value) },
                    }))}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="xl:col-span-2 space-y-4">
          <div className="bg-white/60 backdrop-blur-sm rounded-xl border border-line/40 shadow-sm p-5 space-y-3">
            <div>
              <div className="text-xs font-semibold text-text/80">阶段设置</div>
              <div className="text-[11px] text-muted">名称 + 阈值 + 提示词。</div>
            </div>

            {affectionStages.length === 0 ? (
              <div className="text-xs text-muted">暂无配置。</div>
            ) : (
              <div className="space-y-3">
                {affectionStages.map((s, idx) => (
                  <div key={`${s.key}-${idx}`} className="rounded-2xl border border-line/50 bg-white/80 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[11px] text-muted">key: {s.key}</div>
                      <div className="text-[11px] text-muted">阈值 ≥ {s.minScore}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[11px] text-muted">
                        阶段名称
                        <input
                          className="mt-1 h-6 w-28 rounded-lg border border-line/50 bg-white px-2 text-xs text-text"
                          value={s.label}
                          onChange={(e) => {
                            const next = [...affectionStages];
                            next[idx] = { ...next[idx], label: e.target.value };
                            setAffectionStages(next);
                          }}
                        />
                      </label>
                      <label className="text-[11px] text-muted">
                        阈值
                        <input
                          className="mt-1 h-6 w-20 rounded-lg border border-line/50 bg-white px-2 text-xs text-text"
                          type="number"
                          min={0}
                          max={100}
                          value={s.minScore}
                          onChange={(e) => {
                            const next = [...affectionStages];
                            next[idx] = { ...next[idx], minScore: Number(e.target.value) };
                            setAffectionStages(next);
                          }}
                        />
                      </label>
                    </div>
                    <label className="text-[11px] text-muted">
                      阶段提示词
                      <textarea
                        className="mt-1 w-full min-h-[84px] rounded-lg border border-line/50 bg-white px-3 py-2 text-xs text-text leading-relaxed focus:outline-none focus:ring-2 focus:ring-pink/10"
                        value={s.prompt ?? ""}
                        onChange={(e) => {
                          const next = [...affectionStages];
                          next[idx] = { ...next[idx], prompt: e.target.value };
                          setAffectionStages(next);
                        }}
                        placeholder="用于 system prompt 的阶段提示"
                      />
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const tabs: { key: AdminTab; label: string; icon: string }[] = [
    { key: "invite", label: "邀请码", icon: "vpn_key" },
    { key: "password", label: "密码管理", icon: "lock" },
    { key: "users", label: "用户数据", icon: "group" },
    { key: "affection", label: "好感度", icon: "favorite" },
  ];

  // ===== 移动端 =====
  if (!isDesktop) {
    return (
      <StitchMobileShell title="">
        <WxTitleBar title="管理面板" backTo="/settings" right={<Link to="/settings" className="text-sm text-muted">关闭</Link>} />
        <main className="px-4 py-4 pb-28 space-y-5">
          <div className="rounded-2xl border border-line/60 bg-white/70 backdrop-blur-md p-4 shadow-soft">
            <div className="text-lg font-semibold text-text">系统管理</div>
            <div className="text-xs text-muted mt-1">邀请码、用户与好感度配置</div>
          </div>

          <div className="rounded-2xl border border-line/60 bg-white/70 backdrop-blur-md p-2 shadow-soft">
            <div className="grid grid-cols-2 gap-2">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  className={`h-10 rounded-xl text-sm font-medium transition-all ${activeTab === t.key
                    ? "bg-gradient-to-r from-cta to-pink text-white shadow-sm"
                    : "bg-surface-2/60 text-text/70 hover:bg-surface-2"
                    }`}
                  onClick={() => setActiveTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {error && <div className="rounded-xl border border-red-200 bg-red-50/50 px-4 py-3 text-sm text-red-600">{error}</div>}
          {ok && <div className="rounded-xl border border-cta/20 bg-cta/5 px-4 py-3 text-sm text-cta">{ok}</div>}

          <div className="rounded-2xl border border-line/60 bg-white/70 backdrop-blur-md p-4 shadow-soft">
            {activeTab === "invite" && invitePanel}
            {activeTab === "password" && passwordPanel}
            {activeTab === "users" && usersPanel}
            {activeTab === "affection" && affectionPanel}
          </div>
        </main>
        <StitchMobileTabBar />
      </StitchMobileShell>
    );
  }

  // ===== 桌面端：左栏选项 + 右栏内容 =====
  const leftPane = (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-bold tracking-tight text-text">管理面板</h2>
          <Link className="text-xs text-muted hover:text-text transition-colors" to="/settings">
            返回
          </Link>
        </div>
        <p className="text-xs text-muted/70">系统级配置与用户管理</p>
      </div>

      <div className="mx-4 rounded-2xl border border-line/60 bg-white/70 backdrop-blur-md p-4 shadow-soft">
        <div className="text-xs text-muted">当前角色</div>
        <div className="mt-1 text-sm font-semibold text-text">管理员</div>
      </div>

      <div className="flex-1 px-3 space-y-2 mt-4">
        {tabs.map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              className={`w-full h-12 flex items-center gap-3 px-4 rounded-xl text-sm font-medium transition-all duration-200 ${active
                ? "bg-gradient-to-r from-cta/15 to-pink/10 border border-pink/20 text-text shadow-sm"
                : "text-text/70 hover:bg-white/40 hover:border-white/50 border border-transparent active:scale-95"}`}
              onClick={() => setActiveTab(t.key)}
            >
              <div className={`shrink-0 size-8 rounded-lg flex items-center justify-center border transition-all ${active
                ? "bg-pink/10 border-pink/30 text-pink"
                : "bg-surface-2 border-white/10 text-muted/70"
                }`}>
                <StitchIcon name={t.icon} className="text-[18px]" />
              </div>
              {t.label}
              {active && <StitchIcon name="chevron_right" className="ml-auto text-pink/50 text-[16px]" />}
            </button>
          );
        })}
      </div>
    </div>
  );

  const rightPane = (
    <div className="flex-1 min-h-0 overflow-y-auto bg-white/30 p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-lg font-semibold text-text">{tabs.find((t) => t.key === activeTab)?.label}</div>
          <div className="text-xs text-muted">配置项将在此处生效</div>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50/50 px-4 py-3 text-sm text-red-600">{error}</div>}
      {ok && <div className="mb-4 rounded-xl border border-cta/20 bg-cta/5 px-4 py-3 text-sm text-cta flex items-center gap-2"><StitchIcon name="check_circle" className="text-lg" />{ok}</div>}

      <div className="rounded-2xl border border-line/60 bg-white/70 backdrop-blur-md p-5 shadow-soft">
        {activeTab === "invite" && invitePanel}
        {activeTab === "password" && passwordPanel}
        {activeTab === "users" && usersPanel}
        {activeTab === "affection" && affectionPanel}
      </div>
    </div>
  );

  return (
    <>
      <GrainOverlay />
      <GradientBackground />
      <StitchDesktopShell activeNav="me" leftPane={leftPane} rightPane={rightPane} />
    </>
  );
}
