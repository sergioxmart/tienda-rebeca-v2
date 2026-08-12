# Rebeca Andrade v2 — Router para Claude Code

> **Última actualización: 2026-08-11**

Tienda boutique **Rebeca Andrade** (Colombia, COP): catálogo con
variantes, checkout con pasarela, portal de cliente y panel admin con
Web Builder. Este archivo es el router para Claude Code y apunta al
mismo `Contexto/` que [`AGENTS.md`](AGENTS.md).

## Empezar

1. [`Contexto/README.md`](Contexto/README.md) — índice de la
   documentación.
2. [`Contexto/map.md`](Contexto/map.md) — mapa maestro del repo.
3. [`Contexto/conventions.md`](Contexto/conventions.md) — reglas antes
   de programar.
4. [`Contexto/plans/activos/`](Contexto/plans/activos/) — planes en
   curso.

**Toda la documentación vive en `Contexto/`.** Este archivo solo enruta.

## Convenciones mínimas

- ESM (`"type": "module"` en cada `package.json` con código JS).
- Imports con extensión explícita (`./db.js`, no `./db`).
- Backend: `node:http` nativo, sin Express/Fastify.
- DB: Postgres 16 con `pg.Pool`. Migraciones forward-only.
- Frontends: Vite + React 18, no Next.js.
- Worktrees: `git worktree add -b feature/<name> .worktrees/<name> main`.
- **Nunca** commitear a `main` directamente. Merge por MR.

Para todo lo demás, [`Contexto/conventions.md`](Contexto/conventions.md).

## Comandos (desde `web/`)

```bash
npm run dev            # :3000 + store :5173 + admin :5174
npm run migrate        # migrations pendientes
npm test               # test:core + test:web
npm run build          # store + admin
```

## Regla de mantenimiento

Al terminar una feature, si cambió algo estructural, actualiza
[`Contexto/map.md`](Contexto/map.md) y la ficha del módulo en
[`Contexto/modules/`](Contexto/modules/) con un resumen conciso, nunca
un volcado de código, y nunca en cada mensaje. Atajo: `/update-docs`.
