import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { defaultAffectionStages, defaultAffectionTuning, defaultPromptBricks } from "./defaults.js";

const DB_DIR = path.resolve(process.cwd(), "server", "data");
const DB_FILE = path.join(DB_DIR, "lingxi.sqlite");

function ensureDir() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
}

function now() {
  return new Date().toISOString();
}

function hashPassword(raw) {
  return createHash("sha256").update(`lingxi:${raw}`).digest("hex");
}

export function createDb() {
  ensureDir();
  const db = new Database(DB_FILE);
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      avatar_url TEXT NOT NULL DEFAULT '',
      persona_text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS invites (
      code TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      used_at TEXT DEFAULT NULL,
      used_by_account_id TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      gender TEXT NOT NULL DEFAULT 'unknown',
      avatar_url TEXT NOT NULL DEFAULT '',
      persona_background TEXT NOT NULL DEFAULT '',
      persona_traits TEXT NOT NULL DEFAULT '',
      persona_speech_habits TEXT NOT NULL DEFAULT '',
      card_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      importance REAL NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS prompt_bricks (
      user_id TEXT PRIMARY KEY,
      bricks_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS prompt_presets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      bricks_json TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS moments_posts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      media_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS moments_comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(post_id) REFERENCES moments_posts(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS moments_likes (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(post_id, user_id),
      FOREIGN KEY(post_id) REFERENCES moments_posts(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS preferences_character (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      nickname TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, character_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS affection_state (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 0,
      stage TEXT NOT NULL DEFAULT 'stranger',
      pet_name TEXT DEFAULT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, character_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS affection_stages (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      min_score REAL NOT NULL,
      nsfw TEXT NOT NULL,
      prompt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS affection_tuning (
      id TEXT PRIMARY KEY,
      tuning_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS affection_log (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      delta REAL NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sync_meta (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      characters_updated_at TEXT,
      sessions_updated_at TEXT,
      messages_updated_at_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS idle_nudges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      last_assistant_at TEXT NOT NULL,
      nudge_index INTEGER NOT NULL,
      scheduled_at TEXT NOT NULL,
      sent_message_id TEXT DEFAULT NULL,
      sent_at TEXT DEFAULT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(session_id, last_assistant_at, nudge_index),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS llm_settings (
      user_id TEXT PRIMARY KEY,
      llm_base_url TEXT NOT NULL DEFAULT '',
      llm_api_key_enc TEXT NOT NULL DEFAULT '',
      llm_model_chat TEXT NOT NULL DEFAULT '',
      llm_model_light TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  seedSystemTables(db);
  return db;
}

function seedSystemTables(db) {
  const hasStages = db.prepare("SELECT COUNT(*) AS c FROM affection_stages").get().c;
  if (!hasStages) {
    const insert = db.prepare("INSERT INTO affection_stages (id, key, label, min_score, nsfw, prompt) VALUES (?, ?, ?, ?, ?, ?)");
    for (const s of defaultAffectionStages()) {
      insert.run(randomUUID(), s.key, s.label, s.minScore, s.nsfw, s.prompt ?? "");
    }
  }
  const hasTuning = db.prepare("SELECT COUNT(*) AS c FROM affection_tuning").get().c;
  if (!hasTuning) {
    const tuning = defaultAffectionTuning();
    db.prepare("INSERT INTO affection_tuning (id, tuning_json, updated_at) VALUES (?, ?, ?)").run(
      randomUUID(),
      JSON.stringify(tuning),
      now()
    );
  }
  const hasDefaultPrompt = db.prepare("SELECT COUNT(*) AS c FROM prompt_presets").get().c;
  if (!hasDefaultPrompt) {
    // 系统层面默认预设：后续首次用户会复制一份
  }

  const adminAccount = db.prepare("SELECT id FROM accounts WHERE username = ?").get("admin");
  if (!adminAccount) {
    const accountId = randomUUID();
    const userId = randomUUID();
    const createdAt = now();
    db.prepare("INSERT INTO accounts (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(accountId, "admin", hashPassword("admin123"), "admin", createdAt);
    db.prepare("INSERT INTO users (id, account_id, display_name, avatar_url, persona_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(userId, accountId, "管理员", "", "", createdAt, createdAt);
    ensureUserMeta(db, userId);
    ensureUserPromptBricks(db, userId);
    ensureDefaultPreset(db, userId);
  }
}

export function ensureUserMeta(db, userId) {
  const row = db.prepare("SELECT id FROM sync_meta WHERE user_id = ?").get(userId);
  if (!row) {
    db.prepare(
      "INSERT INTO sync_meta (id, user_id, characters_updated_at, sessions_updated_at, messages_updated_at_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(randomUUID(), userId, null, null, "{}", now());
  }
}

export function updateSyncMeta(db, userId, fields) {
  ensureUserMeta(db, userId);
  const current = db.prepare("SELECT * FROM sync_meta WHERE user_id = ?").get(userId);
  const next = {
    characters_updated_at: fields.characters_updated_at ?? current.characters_updated_at,
    sessions_updated_at: fields.sessions_updated_at ?? current.sessions_updated_at,
    messages_updated_at_json: fields.messages_updated_at_json ?? current.messages_updated_at_json,
    updated_at: now(),
  };
  db.prepare(
    "UPDATE sync_meta SET characters_updated_at = ?, sessions_updated_at = ?, messages_updated_at_json = ?, updated_at = ? WHERE user_id = ?"
  ).run(next.characters_updated_at, next.sessions_updated_at, next.messages_updated_at_json, next.updated_at, userId);
}

export function getSyncMeta(db, userId) {
  ensureUserMeta(db, userId);
  return db.prepare("SELECT * FROM sync_meta WHERE user_id = ?").get(userId);
}

export function ensureUserPromptBricks(db, userId) {
  const row = db.prepare("SELECT user_id FROM prompt_bricks WHERE user_id = ?").get(userId);
  if (!row) {
    db.prepare("INSERT INTO prompt_bricks (user_id, bricks_json, updated_at) VALUES (?, ?, ?)").run(
      userId,
      JSON.stringify(defaultPromptBricks()),
      now()
    );
  }
}

export function ensureDefaultPreset(db, userId) {
  const existing = db.prepare("SELECT id FROM prompt_presets WHERE user_id = ? LIMIT 1").get(userId);
  if (existing) return;
  const bricks = defaultPromptBricks();
  db.prepare(
    "INSERT INTO prompt_presets (id, user_id, name, bricks_json, is_active, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(randomUUID(), userId, "默认预设", JSON.stringify(bricks), 1, now());
}

export function ensureAffectionState(db, userId, characterId) {
  const row = db.prepare("SELECT id FROM affection_state WHERE user_id = ? AND character_id = ?").get(userId, characterId);
  if (!row) {
    db.prepare(
      "INSERT INTO affection_state (id, user_id, character_id, score, stage, pet_name, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(randomUUID(), userId, characterId, defaultAffectionTuning().initScore, "stranger", null, now());
  }
}

export function getAffectionTuning(db) {
  const row = db.prepare("SELECT tuning_json FROM affection_tuning LIMIT 1").get();
  if (!row?.tuning_json) return defaultAffectionTuning();
  try {
    return { ...defaultAffectionTuning(), ...(JSON.parse(row.tuning_json) || {}) };
  } catch {
    return defaultAffectionTuning();
  }
}

export function listAffectionStages(db) {
  return db.prepare("SELECT key, label, min_score, nsfw, prompt FROM affection_stages ORDER BY min_score ASC").all();
}

export function updateAffectionState(db, userId, characterId, nextScore) {
  const stages = listAffectionStages(db);
  let stageKey = stages[0]?.key ?? "stranger";
  for (const s of stages) {
    if (Number(nextScore) >= Number(s.min_score)) stageKey = s.key;
  }
  db.prepare("UPDATE affection_state SET score = ?, stage = ?, updated_at = ? WHERE user_id = ? AND character_id = ?")
    .run(nextScore, stageKey, now(), userId, characterId);
  return stageKey;
}

export function logAffectionDelta(db, userId, characterId, delta, source) {
  db.prepare("INSERT INTO affection_log (id, user_id, character_id, delta, source, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(randomUUID(), userId, characterId, delta, source, now());
}
