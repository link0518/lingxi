import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { apiGetCharacter, apiImportCharacter, apiUpdateCharacterCard, apiUpdateCharacterMeta, apiUploadCharacterAvatar, assetUrl, loadApiConfig } from "../lib/api";
import type { CharacterCardV1 } from "../lib/api";
import { GrainOverlay } from "../ui/GrainOverlay";
import { GradientBackground } from "../ui/GradientBackground";

const emptyCard = (): CharacterCardV1 => ({
  version: 1,
  name: "",
  relationship: "",
  background: "",
  traits: [],
  speechHabits: [],
  boundaries: [],
  catchphrases: [],
});

function splitLines(input: string) {
  return input
    .split(/\r?\n/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function joinLines(items: string[]) {
  return (items || []).join("\n");
}

export function CharacterEditorPage() {
  const { id } = useParams();
  const location = useLocation();
  const cfg = useMemo(() => loadApiConfig(), []);
  const isImportOnly = !id;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<CharacterCardV1>(emptyCard());
  const [gender, setGender] = useState<"unknown" | "male" | "female" | "other">("unknown");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [rawImport, setRawImport] = useState("");

  useEffect(() => {
    if (!cfg) return;
    if (!id) return;
    (async () => {
      setError(null);
      try {
        const data = await apiGetCharacter(cfg, id);
        const maybe = data as { error?: unknown; gender?: unknown; avatarUrl?: unknown };
        if (maybe?.error) throw new Error(String(maybe.error));
        setCard(data.card);
        setGender((maybe.gender as typeof gender | undefined) ?? "unknown");
        setAvatarUrl(String(maybe.avatarUrl ?? ""));
      } catch (e: unknown) {
        const err = e as { message?: unknown };
        setError(String(err?.message ?? e));
      }
    })();
  }, [cfg, id]);

  async function uploadAvatar(file: File) {
    if (!cfg || !id) return;
    setBusy(true);
    setError(null);
    try {
      if (!file.type.startsWith("image/")) throw new Error("仅支持图片文件");
      if (file.size > 2 * 1024 * 1024) throw new Error("图片过大（上限 2MB）");
      const { url } = await apiUploadCharacterAvatar(cfg, file);
      setAvatarUrl(url);
      await apiUpdateCharacterMeta(cfg, id, { avatarUrl: url });
    } catch (e: unknown) {
      const err = e as { message?: unknown };
      setError(String(err?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!cfg || !id) return;
    setBusy(true);
    setError(null);
    try {
      if (!card.name.trim()) throw new Error("请填写角色名");
      await apiUpdateCharacterCard(cfg, id, card);
      await apiUpdateCharacterMeta(cfg, id, { gender, avatarUrl: avatarUrl || undefined, name: card.name.trim() });
    } catch (e: unknown) {
      const err = e as { message?: unknown };
      setError(String(err?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function importFromJson() {
    if (!cfg) return;
    setBusy(true);
    setError(null);
    try {
      const parsed = JSON.parse(rawImport || "{}") as CharacterCardV1;
      if (!parsed || parsed.version !== 1) throw new Error("仅支持 version=1 的角色卡 JSON");
      if (!parsed.name?.trim()) throw new Error("角色卡缺少 name");
      await apiImportCharacter(cfg, parsed);
      setRawImport("");
    } catch (e: unknown) {
      const err = e as { message?: unknown };
      setError(String(err?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ui-page relative overflow-hidden min-h-dvh">
      <GrainOverlay />
      <GradientBackground />

      <div className="relative z-10 mx-auto max-w-5xl px-6 py-8">
        <div className="flex items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-text to-text/70">
              {isImportOnly ? "Create Character" : "Character Profile"}
            </h1>
            <p className="mt-2 text-base text-muted/80">
              Customize the personality and background of your AI companion.
            </p>
          </div>
          <Link
            className="px-4 py-2 rounded-full text-sm font-medium text-text bg-white/5 border border-white/10 hover:bg-white/10 transition-colors backdrop-blur-sm"
            to={location.state?.from ?? "/contacts"}
          >
            Back
          </Link>
        </div>

        {!cfg ? (
          <div className="mt-6 rounded-xl border border-red-200/20 bg-red-500/10 px-6 py-4 text-sm text-red-200 backdrop-blur-md">
            API configuration missing. Please <Link className="underline font-bold" to="/login">Login</Link> to configure.
          </div>
        ) : null}

        {error ? <div className="mt-6 rounded-xl border border-red-200/20 bg-red-500/10 px-6 py-4 text-sm text-red-200 backdrop-blur-md">{error}</div> : null}

        <div className="mt-8 space-y-6">
          <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 shadow-xl backdrop-blur-2xl">
            {/* Inner Glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-text flex items-center gap-2">
                  <span className="w-1 h-6 rounded-full bg-gradient-to-b from-cta to-pink" />
                  Basic Info
                </h2>
                {!isImportOnly ? (
                  <button
                    className="h-9 px-6 rounded-xl bg-gradient-to-r from-cta to-pink text-white text-sm font-bold shadow-lg shadow-cta/20 hover:shadow-cta/40 hover:-translate-y-0.5 active:scale-[0.98] transition-all"
                    onClick={save}
                    disabled={!cfg || busy}
                  >
                    {busy ? "Saving..." : "Save Changes"}
                  </button>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-xs font-semibold text-muted uppercase tracking-wider ml-1">Name</span>
                  <input
                    className="block w-full rounded-xl border border-white/10 bg-black/5 px-4 py-3 text-text placeholder:text-muted/40 focus:border-cta/50 focus:bg-white/5 focus:outline-none focus:ring-1 focus:ring-cta/50 transition-all shadow-inner"
                    value={card.name}
                    onChange={(e) => setCard({ ...card, name: e.target.value })}
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-xs font-semibold text-muted uppercase tracking-wider ml-1">Gender</span>
                  <div className="relative">
                    <select
                      className="block w-full rounded-xl border border-white/10 bg-black/5 px-4 py-3 text-text focus:border-cta/50 focus:bg-white/5 focus:outline-none focus:ring-1 focus:ring-cta/50 transition-all shadow-inner appearance-none"
                      value={gender}
                      onChange={(e) => setGender(e.target.value as typeof gender)}
                      disabled={!cfg || busy || isImportOnly}
                    >
                      <option value="unknown">Unknown</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="other">Other</option>
                    </select>
                    {/* Custom Arrow */}
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-muted">
                      <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" /></svg>
                    </div>
                  </div>
                </label>
                <label className="block space-y-2">
                  <span className="text-xs font-semibold text-muted uppercase tracking-wider ml-1">Relationship / Role</span>
                  <input
                    className="block w-full rounded-xl border border-white/10 bg-black/5 px-4 py-3 text-text placeholder:text-muted/40 focus:border-cta/50 focus:bg-white/5 focus:outline-none focus:ring-1 focus:ring-cta/50 transition-all shadow-inner"
                    value={card.relationship}
                    onChange={(e) => setCard({ ...card, relationship: e.target.value })}
                    placeholder="e.g. Lover, Friend, Mentor..."
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-xs font-semibold text-muted uppercase tracking-wider ml-1">Avatar</span>
                  <div className="flex items-center gap-4 p-2 rounded-xl border border-white/5 bg-white/5">
                    {avatarUrl ? (
                      <img
                        alt="Avatar"
                        src={cfg ? assetUrl(cfg.baseUrl, avatarUrl) : avatarUrl}
                        className="h-12 w-12 rounded-full object-cover border border-white/20 shadow-sm"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-xs text-muted">
                        None
                      </div>
                    )}
                    <label className="cursor-pointer rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-text hover:bg-white/20 transition-colors">
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={!cfg || busy || isImportOnly}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void uploadAvatar(f);
                          e.currentTarget.value = "";
                        }}
                      />
                    </label>
                    <span className="text-xs text-muted/60">Max 2MB</span>
                  </div>
                </label>
              </div>

              <label className="mt-6 block space-y-2">
                <span className="text-xs font-semibold text-muted uppercase tracking-wider ml-1">Background Story</span>
                <textarea
                  className="block w-full min-h-[120px] resize-none rounded-xl border border-white/10 bg-black/5 px-4 py-3 text-text placeholder:text-muted/40 focus:border-cta/50 focus:bg-white/5 focus:outline-none focus:ring-1 focus:ring-cta/50 transition-all shadow-inner leading-relaxed"
                  value={card.background}
                  onChange={(e) => setCard({ ...card, background: e.target.value })}
                />
              </label>
            </div>
          </section>

          <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 shadow-xl backdrop-blur-2xl">
            {/* Inner Glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
            <div className="relative z-10">
              <h2 className="text-xl font-bold text-text flex items-center gap-2 mb-6">
                <span className="w-1 h-6 rounded-full bg-gradient-to-b from-cta to-pink" />
                Personality & Speech
              </h2>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-xs font-semibold text-muted uppercase tracking-wider ml-1">Traits (One per line)</span>
                  <textarea
                    className="block w-full min-h-[160px] resize-none rounded-xl border border-white/10 bg-black/5 px-4 py-3 text-text placeholder:text-muted/40 focus:border-cta/50 focus:bg-white/5 focus:outline-none focus:ring-1 focus:ring-cta/50 transition-all shadow-inner leading-relaxed"
                    value={joinLines(card.traits)}
                    onChange={(e) => setCard({ ...card, traits: splitLines(e.target.value) })}
                    placeholder={"Tsundere\nGentle\nPossessive"}
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-xs font-semibold text-muted uppercase tracking-wider ml-1">Speech Habits</span>
                  <textarea
                    className="block w-full min-h-[160px] resize-none rounded-xl border border-white/10 bg-black/5 px-4 py-3 text-text placeholder:text-muted/40 focus:border-cta/50 focus:bg-white/5 focus:outline-none focus:ring-1 focus:ring-cta/50 transition-all shadow-inner leading-relaxed"
                    value={joinLines(card.speechHabits)}
                    onChange={(e) => setCard({ ...card, speechHabits: splitLines(e.target.value) })}
                    placeholder={"Short sentences\nUses emojis often\nFormal tone"}
                  />
                </label>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-xs font-semibold text-muted uppercase tracking-wider ml-1">Boundaries</span>
                  <textarea
                    className="block w-full min-h-[100px] resize-none rounded-xl border border-white/10 bg-black/5 px-4 py-3 text-text placeholder:text-muted/40 focus:border-cta/50 focus:bg-white/5 focus:outline-none focus:ring-1 focus:ring-cta/50 transition-all shadow-inner leading-relaxed"
                    value={joinLines(card.boundaries)}
                    onChange={(e) => setCard({ ...card, boundaries: splitLines(e.target.value) })}
                    placeholder={"No violence\nNo NSFW in public"}
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-xs font-semibold text-muted uppercase tracking-wider ml-1">Catchphrases (Optional)</span>
                  <textarea
                    className="block w-full min-h-[100px] resize-none rounded-xl border border-white/10 bg-black/5 px-4 py-3 text-text placeholder:text-muted/40 focus:border-cta/50 focus:bg-white/5 focus:outline-none focus:ring-1 focus:ring-cta/50 transition-all shadow-inner leading-relaxed"
                    value={joinLines(card.catchphrases)}
                    onChange={(e) => setCard({ ...card, catchphrases: splitLines(e.target.value) })}
                    placeholder={"'Darling...'\n'It's not like I like you!'"}
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 shadow-xl backdrop-blur-2xl">
            <div className="relative z-10">
              <h2 className="text-xl font-bold text-text flex items-center gap-2 mb-2">
                <span className="w-1 h-6 rounded-full bg-white/20" />
                Import JSON
              </h2>
              <p className="ml-3 text-sm text-muted/80 mb-4">Paste a character card JSON (v1) to create a new character.</p>

              <textarea
                className="block w-full min-h-[120px] resize-none rounded-xl border border-white/10 bg-black/5 px-4 py-3 font-mono text-xs text-text placeholder:text-muted/40 focus:border-cta/50 focus:bg-white/5 focus:outline-none focus:ring-1 focus:ring-cta/50 transition-all shadow-inner"
                value={rawImport}
                onChange={(e) => setRawImport(e.target.value)}
                placeholder='{"version":1,"name":"New Character","relationship":"Friend" ...}'
              />
              <div className="mt-4 flex items-center gap-3">
                <button
                  className="h-10 px-5 rounded-xl bg-surface hover:bg-surface-2 text-text text-sm font-medium border border-white/10 shadow-sm transition-all"
                  onClick={importFromJson}
                  disabled={!cfg || busy || !rawImport.trim()}
                >
                  {busy ? "Importing..." : "Import & Create"}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
