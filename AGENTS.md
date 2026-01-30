# Repository Guidelines

## Project Structure & Module Organization
- `src/`: Frontend React code (Vite + Tailwind). Views live in `src/views/`, shared UI in `src/ui/`, and API helpers in `src/lib/`.
- `server/`: Express backend, SQLite setup, auth, and defaults. Entry is `server/index.js`.
- `public/`: Static assets served by Vite.
- `docs/`: Project design notes (e.g. `docs/项目设计文档.md`).
- `dist/`: Build output from `npm run build`.

## Build, Test, and Development Commands
- `npm run dev`: Start Vite frontend dev server.
- `npm run dev:server`: Start backend only (`node server/index.js`).
- `npm run dev:full`: Start frontend + backend together (via `concurrently`).
- `npm run build`: Type-check (`tsc -b`) and build production assets.
- `npm run lint`: Run ESLint across the repo.
- `npm run preview`: Preview the production build locally.

## Coding Style & Naming Conventions
- TypeScript/TSX with ES modules (`"type": "module"`).
- Indentation: 2 spaces, no tabs.
- React components use `PascalCase` (e.g. `ChatPane`), functions/vars use `camelCase`.
- Prefer explicit types for API payloads and responses in `src/lib/api.ts`.
- Linting via ESLint (no Prettier configured).

## Testing Guidelines
- No dedicated test framework or test directory detected yet.
- If adding tests, keep them close to modules or in a `/tests` folder, and name as `*.test.ts` / `*.test.tsx`.
- Run lint and `npm run build` as basic checks until tests are introduced.

## Commit & Pull Request Guidelines
- Commit message convention: Conventional Commits (e.g. `feat: add sessions api`, `fix: handle missing config`, `docs: update architecture`).
- PRs should include: summary and key changes (screenshots optional unless UI changes are significant).

## Documentation Workflow (Required)
- Before implementing new features: update `docs/架构设计.md` with planned changes in **变更记录** (planned entry).
- After implementing: update **变更记录** with final scope, files touched, and any migration notes.

## Security & Configuration Notes
- Backend JWT secret uses `JWT_SECRET` env var (see `server/auth.js`).
- LLM API keys are stored locally in browser config (not on server).
- SQLite file stored in `server/data/lingxi.sqlite`; treat as local dev data.
