import { useEffect, useMemo, useRef, useState } from "react";
import {
  apiGetCharacter,
  apiImportCharacter,
  apiUpdateCharacterCard,
  apiUpdateCharacterMeta,
  apiDeleteCharacter,
  apiUploadCharacterAvatar,
  assetUrl,
  type ApiConfig,
  type CharacterCardV1,
} from "../lib/api";
import { Modal } from "./Modal";

type CreateCharacterModalProps = {
  open: boolean;
  onClose: () => void;
  cfg: ApiConfig | null;
  onCreated: () => void;
  editId?: string | null;
};

const emptyCard = (): CharacterCardV1 => ({
  version: 1,
  name: "",
  relationship: "",
  background: "",
  traits: [],
  speechHabits: [],
  boundaries: [],
  catchphrases: [],
  style: { sweetness: "medium", proactivity: "medium", messageDensity: "balanced" },
});

export function CreateCharacterModal(props: CreateCharacterModalProps) {
  const { open, onClose, cfg, onCreated, editId } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<CharacterCardV1>(() => emptyCard());
  const [gender, setGender] = useState<"male" | "female">("female");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const loadedIdRef = useRef<string | null>(null);

  const disabled = useMemo(() => {
    if (!cfg) return true;
    if (!card.name.trim()) return true;
    if (!card.background.trim()) return true;
    return busy;
  }, [busy, card.background, card.name, cfg]);

  function closeAndReset() {
    setError(null);
    setBusy(false);
    setCard(emptyCard());
    setGender("female");
    setAvatarUrl("");
    loadedIdRef.current = null;
    onClose();
  }

  useEffect(() => {
    if (!open || !cfg || !editId) return;
    if (loadedIdRef.current === editId) return;

    loadedIdRef.current = editId;
    setBusy(true);
    setError(null);
    (async () => {
      try {
        const data = await apiGetCharacter(cfg, editId);
        const maybe = data as { error?: unknown; gender?: unknown; avatarUrl?: unknown };
        if (maybe?.error) throw new Error(String(maybe.error));
        setCard({ ...data.card, name: data.name ?? data.card.name });
        const g = String(maybe.gender ?? "female");
        setGender(g === "male" ? "male" : "female");
        setAvatarUrl(String(maybe.avatarUrl ?? ""));
      } catch (e: unknown) {
        const err = e as { message?: unknown };
        setError(String(err?.message ?? e));
      } finally {
        setBusy(false);
      }
    })();
  }, [cfg, editId, open]);

  async function uploadAvatar(file: File) {
    if (!cfg) return;
    setBusy(true);
    setError(null);
    try {
      if (!file.type.startsWith("image/")) throw new Error("仅支持图片文件");
      if (file.size > 2 * 1024 * 1024) throw new Error("图片过大（上限 2MB）");
      const { url } = await apiUploadCharacterAvatar(cfg, file);
      setAvatarUrl(url);
    } catch (e: unknown) {
      const err = e as { message?: unknown };
      setError(String(err?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!cfg) return;
    setError(null);
    if (!card.name.trim()) return setError("请填写角色名称");
    if (!card.background.trim()) return setError("请填写角色设定（Background）");

    setBusy(true);
    try {
      const normalized: CharacterCardV1 = {
        ...card,
        name: card.name.trim(),
        relationship: card.relationship.trim(),
        background: card.background.trim(),
        traits: [],
        speechHabits: [],
        boundaries: [],
        catchphrases: [],
      };

      if (editId) {
        await apiUpdateCharacterCard(cfg, editId, normalized);
        await apiUpdateCharacterMeta(cfg, editId, { gender, avatarUrl: avatarUrl || undefined, name: normalized.name });
      } else {
        const res = await apiImportCharacter(cfg, normalized);
        await apiUpdateCharacterMeta(cfg, res.id, { gender, avatarUrl: avatarUrl || undefined });
      }
      onCreated();
      closeAndReset();
    } catch (e: unknown) {
      const err = e as { message?: unknown };
      setError(String(err?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title={editId ? "编辑角色卡" : "创建角色卡"} onClose={closeAndReset} className="max-w-2xl">
      {!cfg ? <div className="ui-card-subtle p-4 text-sm text-muted">尚未登录或未配置 API Token，请先到“我的 / 登录”完成配置。</div> : null}

      {error ? <div className="mt-3 ui-card-subtle p-3 text-sm text-red-600">{error}</div> : null}

      <div className="mt-4 grid grid-cols-1 gap-3">
        <label className="text-sm text-muted">
          角色名称（Name）
          <input className="ui-input mt-1" value={card.name} onChange={(e) => setCard((c) => ({ ...c, name: e.target.value }))} placeholder="例如：澪" />
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-sm text-muted">
            性别
            <select className="ui-input mt-1" value={gender} onChange={(e) => setGender(e.target.value as typeof gender)} disabled={!cfg || busy}>
              <option value="female">女</option>
              <option value="male">男</option>
            </select>
          </label>

          <label className="text-sm text-muted">
            头像（用于聊天展示）
            <input
              type="file"
              accept="image/*"
              className="block w-full text-sm text-muted mt-1 file:mr-4 file:rounded-control file:border file:border-line file:bg-surface file:px-3 file:py-2 file:text-sm file:text-text hover:file:bg-surface-2/60"
              disabled={!cfg || busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadAvatar(f);
                e.currentTarget.value = "";
              }}
            />
            {avatarUrl ? (
              <div className="mt-2 flex items-center gap-3">
                <img alt="角色头像预览" src={cfg ? assetUrl(cfg.baseUrl, avatarUrl) : avatarUrl} className="h-12 w-12 rounded-full object-cover border border-line bg-surface" />
                <div className="text-xs text-muted">已选择头像</div>
              </div>
            ) : null}
          </label>
        </div>

        <label className="text-sm text-muted">
          关系（Relationship）
          <input
            className="ui-input mt-1"
            value={card.relationship}
            onChange={(e) => setCard((c) => ({ ...c, relationship: e.target.value }))}
            placeholder="例如：恋人 / 朋友 / 导师"
          />
        </label>

        <label className="text-sm text-muted">
          设定（Background）
          <textarea
            className="ui-input mt-1 min-h-[120px] resize-y"
            value={card.background}
            onChange={(e) => setCard((c) => ({ ...c, background: e.target.value }))}
            placeholder="角色背景、世界观、与玩家的关系、行为准则等"
          />
        </label>

        {/* 与桌面端保持一致：仅保留 Name/Background/Relationship/头像/性别 */}

        <div className="mt-2 flex items-center justify-end gap-3">
          {editId ? (
            <button
              className="h-11 px-4 text-sm rounded-control border border-red-200 text-red-600 hover:bg-red-50 transition disabled:opacity-60"
              onClick={async () => {
                if (!cfg || !editId) return;
                if (!window.confirm("确定删除该角色？将同时删除其会话与消息（当前为物理删除）。")) return;
                setBusy(true);
                setError(null);
                try {
                  await apiDeleteCharacter(cfg, editId);
                  onCreated();
                  closeAndReset();
                } catch (e: unknown) {
                  const err = e as { message?: unknown };
                  setError(String(err?.message ?? e));
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
            >
              删除
            </button>
          ) : null}
          <button className="ui-btn-ghost h-11 px-4 text-sm" onClick={closeAndReset} disabled={busy}>
            取消
          </button>
          <button
            className="ui-btn-primary h-11 px-5 text-sm"
            disabled={disabled}
            onClick={() => void submit()}
          >
            {busy ? "保存中…" : editId ? "保存修改" : "创建"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
