import { useMemo, useState } from "react";
import { apiUpdateCharacterPreference, type ApiConfig } from "../lib/api";

export function AffectionNicknameCard(props: {
  cfg: ApiConfig;
  characterId: string;
  onSaved?: (nickname: string) => void;
  suggested?: string[];
}) {
  const suggestions = useMemo(() => (props.suggested?.length ? props.suggested.slice(0, 3) : ["小笨蛋", "宝", "朋友"]), [props.suggested]);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function save(nickname: string) {
    const n = nickname.trim();
    if (!n) return;
    setBusy(true);
    try {
      await apiUpdateCharacterPreference(props.cfg, props.characterId, { nickname: n });
      setDone(n);
      props.onSaved?.(n);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto w-full max-w-[520px] rounded-2xl border border-line bg-surface shadow-soft p-4">
        <div className="text-sm font-semibold text-text">好呀</div>
        <div className="mt-1 text-xs text-muted">以后我就这样称呼你：{done}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[520px] rounded-2xl border border-line bg-surface shadow-soft p-4">
      <div className="text-sm font-semibold text-text">我可以怎么称呼你？</div>
      <div className="mt-1 text-xs text-muted">选一个你喜欢的称呼，或者自定义一个（不影响聊天，可忽略）。</div>

      <div className="mt-3 flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button key={s} className="ui-btn-ghost h-9 px-3 text-sm" disabled={busy} onClick={() => void save(s)}>
            {s}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          className="ui-input h-9"
          placeholder="自定义称呼（最多 40 字）"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          disabled={busy}
        />
        <button className="ui-btn-primary h-9 px-4 text-sm" disabled={busy || !custom.trim()} onClick={() => void save(custom)}>
          保存
        </button>
      </div>
    </div>
  );
}

