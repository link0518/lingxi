import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { IconHeart } from "../ui/icons";
import { Avatar } from "../ui/Avatar";
import { GrainOverlay } from "../ui/GrainOverlay";
import { GradientBackground } from "../ui/GradientBackground";
import {
  apiCreateSession,
  apiListCharacters,
  apiSeedCharacters,
  loadApiConfig,
} from "../lib/api";

type CharacterCardModel = {
  id: string;
  name: string;
  tags: string[];
  tagline: string;
};

export function CharactersPage() {
  const navigate = useNavigate();
  const cfg = useMemo(() => loadApiConfig(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [characters, setCharacters] = useState<CharacterCardModel[]>([]);

  useEffect(() => {
    if (!cfg) return;
    (async () => {
      try {
        const data = await apiListCharacters(cfg);
        setCharacters(
          data.characters.map((c) => ({
            id: c.id,
            name: c.name,
            tagline: c.tagline || "",
            tags: ["恋爱模拟", "二次元"],
          }))
        );
      } catch (e: unknown) {
        const err = e as { message?: unknown };
        setError(String(err?.message ?? e));
      }
    })();
  }, [cfg]);

  async function seed() {
    if (!cfg) return;
    setBusy(true);
    setError(null);
    try {
      await apiSeedCharacters(cfg);
      const data = await apiListCharacters(cfg);
      setCharacters(
        data.characters.map((c) => ({
          id: c.id,
          name: c.name,
          tagline: c.tagline || "",
          tags: ["恋爱模拟", "二次元"],
        }))
      );
    } catch (e: unknown) {
      const err = e as { message?: unknown };
      setError(String(err?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function startChat(characterId: string) {
    if (!cfg) return;
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem("lingxi_last_character_id", characterId);
      const { sessionId } = await apiCreateSession(cfg, characterId);
      navigate(`/chat/${sessionId}`);
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

      <div className="relative z-10 mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-text to-text/70">
              Select Your Companion
            </h1>
            <p className="mt-2 text-base text-muted/80 max-w-lg">
              Choose a character to start your journey. Each relationship is unique and evolves with your conversation.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              className="px-4 py-2 rounded-full text-sm font-medium text-text bg-white/5 border border-white/10 hover:bg-white/10 transition-colors backdrop-blur-sm"
              to="/settings"
            >
              Settings
            </Link>
            <button
              className="px-4 py-2 rounded-full text-sm font-medium text-text bg-white/5 border border-white/10 hover:bg-white/10 transition-colors backdrop-blur-sm"
              onClick={seed}
              disabled={!cfg || busy}
            >
              Initialize Defaults
            </button>
          </div>
        </div>

        {!cfg ? (
          <div className="mt-6 rounded-xl border border-red-200/20 bg-red-500/10 px-6 py-4 text-sm text-red-200 backdrop-blur-md">
            API configuration missing. Please <Link className="underline font-bold" to="/login">Login</Link> to configure.
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 rounded-xl border border-red-200/20 bg-red-500/10 px-6 py-4 text-sm text-red-200 backdrop-blur-md">{error}</div>
        ) : null}

        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {characters.map((c) => (
            <div
              key={c.id}
              className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-cta/5"
            >
              {/* Card Inner Glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="relative z-10">
                <div className="flex items-start gap-4">
                  <div className="shrink-0 relative">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-cta to-pink blur-md opacity-40 group-hover:opacity-70 transition-opacity" />
                    <div className="relative rounded-full p-0.5 bg-gradient-to-br from-white/30 to-white/5 border border-white/10">
                      <Avatar size={56} />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 pt-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate text-lg font-bold text-text group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-cta group-hover:to-pink transition-all">
                        {c.name}
                      </div>
                      <button className="h-8 w-8 rounded-full grid place-items-center hover:bg-white/10 text-muted/50 hover:text-pink transition-colors" aria-label="Favorite">
                        <IconHeart className="h-5 w-5" />
                      </button>
                    </div>
                    <p className="mt-1 text-sm text-muted/70 line-clamp-2 h-10 leading-relaxed font-light">{c.tagline || "No description provided."}</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {c.tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center rounded-lg border border-white/5 bg-white/5 px-2.5 py-1 text-xs text-muted/80 backdrop-blur-md"
                    >
                      {t}
                    </span>
                  ))}
                </div>

                <div className="mt-6 flex items-center justify-between gap-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted/50 font-semibold">Affection</div>
                  <div className="h-1.5 flex-1 max-w-[100px] overflow-hidden rounded-full bg-black/20 backdrop-blur-sm">
                    <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-cta to-pink shadow-[0_0_8px_rgba(var(--pink)_/_0.6)]" />
                  </div>
                </div>

                <div className="mt-6 flex gap-3 opacity-80 group-hover:opacity-100 transition-opacity pt-4 border-t border-white/5">
                  <Link
                    className="flex-1 h-9 flex items-center justify-center rounded-xl text-xs font-medium text-muted hover:text-text bg-white/5 hover:bg-white/10 border border-white/5 transition-all"
                    to={`/characters/${c.id}/edit`}
                  >
                    Edit
                  </Link>
                  <button
                    className="flex-[2] h-9 rounded-xl bg-gradient-to-r from-cta to-pink text-white text-xs font-bold shadow-lg shadow-cta/20 hover:shadow-cta/40 hover:-translate-y-0.5 active:scale-[0.98] transition-all"
                    onClick={() => startChat(c.id)}
                    disabled={busy || !cfg}
                  >
                    {busy ? "Connecting..." : "Start Chat"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
