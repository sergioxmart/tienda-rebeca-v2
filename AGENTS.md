# Rebeca Andrade v2 — Router universal

> **Última actualización: 2026-08-11**

Mono-repo de la tienda boutique **Rebeca Andrade** (Colombia, COP):
catálogo con variantes, checkout con pasarela (ePayco + Mercado Pago),
portal de cliente y panel admin con Web Builder. `core/` = lógica
genérica multi-cliente; `web/` = la tienda concreta. Backend `node:http`
+ Postgres 16; frontends Vite + React 18. Hoy corre **local**.

## Para ubicarte, lee `Contexto/`

1. [`Contexto/README.md`](Contexto/README.md) — índice de toda la
   documentación. Entrada neutral.
2. [`Contexto/map.md`](Contexto/map.md) — mapa maestro: llega al archivo
   de cualquier funcionalidad **sin explorar el repo**.
3. [`Contexto/conventions.md`](Contexto/conventions.md) — reglas del
   proyecto. **Léelo antes de programar.**
4. [`Contexto/plans/activos/`](Contexto/plans/activos/) — planes en
   curso, por si la feature ya está planeada.

**Toda la documentación vive en `Contexto/`.** Este archivo solo enruta;
no dupliques contenido aquí. No asumas nada que no esté en `Contexto/`
o en el código.

## Reglas críticas (detalle en `Contexto/conventions.md`)

- **No commitear a `main` directamente.** Rama `feature/*` o `fix/*` en
  worktree + MR.
- **Secrets nunca al chat ni a memoria persistente de la IA.** El `.env`
  es gitignored; los secretos se generan con `openssl rand -hex 32` y se
  pegan al `.env` local.
- **Migraciones forward-only.** Nunca editar una ya aplicada; crear la
  siguiente.
- **No borrado destructivo** (`rm -rf`): usar `git rm` o `mavis-trash`.
- **Idioma de la UI**: español colombiano (tuteo: "tú/puedes", nunca
  "vos/podés").
- **El legacy no se amplía.** `routes/admin/legacy.js` y
  `routes/public/legacy.js` son el modelo boutique viejo, en migración.
  Ver [`Contexto/modules/legacy-rebeca.md`](Contexto/modules/legacy-rebeca.md).

## Comandos (desde `web/`)

```bash
npm install            # instala los 3 workspaces (core/ se instala aparte)
npm run dev            # server :3000 + Vite store :5173 + Vite admin :5174
npm run dev:server     # solo backend
npm run dev:webhook    # solo webhook (:9001, no requiere DB)
npm run db:setup       # crea rol + DB la primera vez
npm run migrate        # aplica migrations pendientes
npm run create-admin -- <email> <pass>   # crea el primer admin
npm run build          # build de store + admin
npm test               # test:core + test:web (node:test)
```

Las credenciales salen de `web/.env` (gitignored); los scripts lo cargan
con `--env-file`. En un worktree nuevo: `npm install` también en `core/`
y crear el `.env`. Setup completo en
[`Contexto/dev-setup.md`](Contexto/dev-setup.md).

## Regla de mantenimiento

Al terminar una feature, **si cambió algo estructural** (nuevo módulo,
nueva ruta, nueva decisión técnica), actualiza
[`Contexto/map.md`](Contexto/map.md) y la ficha del módulo en
[`Contexto/modules/`](Contexto/modules/) con un **resumen conciso**,
nunca un volcado de código, y **nunca en cada mensaje**. Si agregas un
endpoint, agrégalo a [`Contexto/api.md`](Contexto/api.md) en el mismo
commit.
