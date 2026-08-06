# TechStore — Router para Claude Code

> **Última actualización: 2026-08-06**

Este archivo es el router específico para Claude Code. Apunta al mismo
`Contexto/` que `AGENTS.md`.

## Empezar

1. Lee [`Contexto/map.md`](Contexto/map.md) — el mapa maestro del repo.
2. Lee [`Contexto/conventions.md`](Contexto/conventions.md) — reglas
   del proyecto antes de programar.
3. Lee [`Conjeto/README.md`](Contexto/README.md) — índice completo de
   la documentación.

## Convenciones mínimas

- ESM (`"type": "module"` en cada `package.json` con código JS).
- Imports con extensión explícita (`./db.js`, no `./db`).
- Backend: `node:http` nativo, sin Express/Fastify.
- DB: Postgres 16 con `pg.Pool`. Migrations forward-only.
- Frontends: Vite + React 18, no Next.js.
- Worktrees para features: `git worktree add -b feature/<name>
  .worktrees/<name> main`.
- **Nunca** commear a `main` directamente. Merge por MR.

Para todo lo demás, [`Contexto/conventions.md`](Contexto/conventions.md).
