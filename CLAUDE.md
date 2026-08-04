# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**APS (Askida Platform Studio)** — a server-rendered admin/studio app for orchestrating media-platform
integrations (primarily **Iconik**), built around a visual workflow builder ("WFD" / the new "Builder"),
a documentation generator, and an API cataloging tool. Node.js + Express backend, PostgreSQL via Prisma,
vanilla-JS frontend served as static files (no bundler, no frontend framework).

**Fundamental principle — APS never touches bytes.** APS does not download, upload, or transcode any
file. It only makes API calls. When a transfer/transcode is needed, the *target platform* performs it
(e.g. Iconik's Export Location pushes Iconik→S3); APS triggers it and then verifies the result via
listing/read calls (e.g. `aws_s3 list_objects`). Never design a feature around APS moving media bytes.

## Commands

```bash
npm run dev          # nodemon server/index.js — dev server (reads .env, port APS_PORT/3000)
npm start            # node server/index.js — production start
npm run db:migrate   # prisma migrate dev
npm run db:studio    # prisma studio
npm run db:reset     # prisma migrate reset
node --check <file>  # mandatory syntax check before considering any JS edit done (no test suite exists)
```

There is no test framework, linter, or build step in this repo — `node --check` on every touched `.js`
file is the only mechanical verification available. There is no `.env.example`; `.env` (gitignored) holds
`DATABASE_URL`, `JWT_SECRET`, `APS_SECRET` (AES key for encrypted credential columns), and `APS_*_DIR` paths.

**After any Prisma schema change**, the order matters: migrate (`db:migrate` or `prisma db push`) →
`prisma generate` → restart the server. After any change to `server/routes/*`, `server/index.js`,
`server/lib/*`, or the schema, the running server must be restarted (nodemon does this automatically
under `npm run dev`; a manually-started `node server/index.js` will not pick up changes).

## Architecture

### Backend shape
- `server/index.js` — single Express entrypoint. Mounts every router under `/api/*`, serves
  `server/public/` as static frontend, and falls back to `index.html` for any non-API GET (SPA-style
  client routing across multiple independent "apps" under `server/public/`).
- `server/routes/*.js` — one file per REST resource (flows, connexions, environments, platforms,
  aps-search, arbo-templates, mapping, endpoints, package, context, sync-jobs, ikon-data, iconik-proxy,
  wfd-data, status). Each typically opens its own short-lived `PrismaClient` per request (see pattern in
  `aps-search.js`). `wfd-data.js` is a grab-bag for several resources (nommages, contacts, scripts,
  palnodes, plus `builder-flows` incl. its versioning/`usage` endpoints) predating per-resource files —
  `mappings` was split out of it into `mapping.js` on 2026-08-03 (org-scoping bug in the old inline
  version); don't assume everything in `wfd-data.js` is current, check for a dedicated file first.
- `server/engine/wfd-*.js` — the **WFD Engine**: a standalone workflow execution engine (context,
  executor, trigger/scheduler, node handlers, Iconik client, run history), mounted at `/wfd` via
  `wfd-engine-express.js` (Express + SSE for live events). This engine predates the org/multi-tenant
  model and is intentionally left unfiltered by org context (see `org-context.js` below) — don't
  "fix" that without reading the guard-rail comment in that file first.
  - `wfd-engine-handlers.js` (~4300 lines) is the single dispatch table for every node `family`
    (conditions, transforms, id-generators, string ops, asset/collection CRUD, etc.) — grep `case '`
    to find a given family's behavior before assuming it doesn't exist.
- `server/lib/org-context.js` — resolves "which organisation is this request in" from
  `X-Org-Id` header / `?orgId=` / `aps-org-id` cookie, with a role-based filter (`superadmin`/`admin`
  see everything unfiltered; `editor`/`viewer` are scoped to their org). **There is no auth system yet**
  (no `req.user`) — absence of a role header is treated as implicit superadmin, which is deliberate:
  it preserves pre-multi-tenant behavior for WFD and existing screens.
- `server/lib/s3-service.js` / `package-executor.js` / `iconik-service.js` — the VodFactory pilotage
  layer: S3 is only *listed* to verify what Iconik already delivered (`verifierParListing`), never
  written to by APS itself.

### Frontend shape (`server/public/`)
No build step — plain HTML/CSS/JS loaded directly by the browser, organized as independent
mini-apps sharing `_shared/`:
- `_shared/` — cross-app JS/CSS: navbar, org-context selector (cookie-based org switch + reload),
  design tokens.
- `admin/` — organisation/platform/environment/connexion/resource administration screens.
  `admin/manifests/`, `admin/mappings/`, and `admin/endpoints/` are dedicated editor screens (list +
  detail, same `adm-*`/two-column layout) for the `Manifest`, `Mapping`, and `Endpoint` org resources
  respectively — Mapping's screen (2026-08-03) replaced its listing in the older generic
  `admin/ressources/` (which now only covers `nommages`/`contacts`, not yet given their own screens).
  `Endpoint` (2026-08-04) models a named HTTP request sequence (e.g. a partner "Publication API") —
  same paradigm as `Mapping`/`Manifest`, referenced by a workflow node via `sequenceId`.
- `builders/workflow/` — the **new Builder**, built around a **pivot document** format
  (`pivot-*.js`): a declarative, human-readable canonical representation of a workflow
  (`{pivot, form, workflow, steps, edges, presentation}`), stored in the `BuilderFlow` Prisma model
  and distinct from the older raw WFD `Flow` model. `pivot-to-wfd.js` converts pivot → WFD's
  executable node/connection graph (regenerating ports, positions, and flattening nested loop
  bodies) — this conversion is the correctness proof that the pivot format loses nothing. It also
  resolves org-resource references into the WFD "exchange format" at conversion time, via an
  `options.resolutions` argument the caller pre-fetches (the converter itself makes no network
  calls): `mappingId` → `lkRows` (Lookup), `manifestId` → `s3Mappings` incl. cardinality (Deliver),
  `manifestId` → `checks` filtered on `verifyPath` (Verify), `manifestId` → `essences` (History,
  builds a per-level ✅/❌ checklist at *run time* — see `checker()`/`workflow_history()` below), and
  `sequenceId` → `steps` (Partner/`http_sequence`, from an `Endpoint` resource). Verify/History/Deliver
  all key off the *same* `Manifest.essences[]` (each essence carries what it needs: `sortie`+
  `cardinalite` for Deliver, `verifyEndpoint`+`verifyPath` for Verify, `role`+`sortie` for History) —
  one manifest, no per-level node duplication. The per-level filtering itself (`appliesTo` vs the
  current `TypeCollection`) happens at *run time* inside the engine handler (`aws_s3()`, `checker()`,
  `workflow_history()` in `wfd-engine-handlers.js`), not at conversion time — conversion doesn't know
  which level will run.
  `pivot-manifest.js` / `pivot-packager.js` model delivery manifests (what must be delivered, with
  what cardinality, plus optionally how to re-verify it with the partner) as an org-level resource,
  analogous to `Mapping`/`Nommage`. The Builder homepage (`workflow.html`) has five tabs — Workflows,
  Manifestes, Tree Builder (`arbo-canvas.html`, edits `ArboTemplate` org resources as a nested outline
  — a template is a strict tree, not a free-form graph), Correspondances, Endpoints (the last three
  link out to their `admin/*` editor screens) — each with row-level JSON export and page-level JSON
  import (2026-08-04, generic helpers in `workflow.js`; import always creates a new resource, never
  overwrites by id).
  **Draft/publish exists for `BuilderFlow`** (2026-08-03/04): `BuilderFlowVersion` is an append-only
  table (one row per explicit "Publier" click, never mutated); status is *never stored*, only computed
  by comparing the current draft (minus `presentation`, which isn't versioned) against the latest
  frozen version — `published` if identical, `draft` otherwise. Both the list (`GET /builder-flows`)
  and detail endpoint expose this computed `status`. Editing after publish is always allowed (no
  lock) — the frozen copy is the protection, not an edit block. The canvas's old "deactivate" mock
  button was removed, not wired — don't look for it.
- `builders/doc/` and `builders/platform/` — documentation builder and platform/connexion builder.
- `platforms/iconik/` — the Iconik-specific integration surface (automations, dashboard, search,
  settings, viewer, workflow designer UI) — this is the largest and most mature vertical, built up
  over months; check `platforms/iconik/_shared/` before adding new Iconik glue code.
- `viewer/`, `scenario/`, `studio/` — additional app surfaces.

`core/` and `modules/` at the repo root are empty scaffolding (placeholder subdirectories only,
no files) — not yet in use; don't assume code lives there.

### Data model (`prisma/schema.prisma`)
Organisation-rooted multi-tenancy: `Organisation` owns most resources (`Project`, `Environment`,
`Connexion`, `Mapping`, `Manifest`, `Endpoint`, `BuilderFlow` (+ append-only `BuilderFlowVersion`),
`Nommage`, `Script`, `DocAsset`, `ContactList`, `SyncJob`, etc.) via `orgId`. `Connexion` is mid-migration from being environment-scoped (`envId`)
to org-scoped (`orgId`, nullable, backfilled) — both fields currently coexist by design; do not
collapse this without reading the "Temps 1/2/3" migration notes at the top of the `Connexion` model
and in the cartography journals.

**Sync/versioning subsystem**: `SyncJob` → `IkonSnapshot` (immutable, one per sync run) → typed
`Ikon*` tables (`IkonCollection`, `IkonTeam`, `IkonUser`, `IkonField`, etc.), one table per Iconik
object type, each carrying `rawData Json?` for anything unmodeled plus its own indexed columns.
Snapshots are never overwritten — "current state" = latest snapshot per `(envId, scope)`; older
snapshots persist for audit/diff/rollback. **Zero business data belongs in browser localStorage** —
localStorage is reserved for UI session state only (token, light preferences). This is a hard
architectural rule stated at the top of the schema file.

## Working conventions specific to this repo

This project maintains its own living process doc at `_journaux/methode-travail-aps.md` and dated
cartography snapshots (`_journaux/*_cartographie-aps.md`) and session journals
(`_journaux/journal-aps-*.md`) — **read the most recent cartography and methode file before
investigating "how does X work"**; a large amount of Iconik/WFD behavior has already been mapped
across months of sessions, and re-discovering it from scratch is the single biggest documented waste
of effort in this project. Do not re-litigate the "APS never touches bytes" rule above — it was
violated once and cost a large fraction of a session to unwind.

- **Commit and push directly to `main` when asked to land work** — no feature branch, no PR needed
  for routine changes. (Updated 2026-08-03: the previous "branch first, human applies patches"
  rule dated from before this project used Claude Code, when Claude occasionally committed to
  `main` in the wrong clone — a tooling-confusion problem that doesn't apply once Claude is
  operating directly in the user's one true working directory. A branch→PR→squash cycle was tried
  once on 2026-08-03 and found slow/error-prone for a single-maintainer repo; direct-to-main is the
  standing preference now.) Still only commit/push when the user has actually asked for it in the
  conversation — this changes *how* landing happens, not whether to commit unprompted.
- Run `node --check` on every touched `.js` file — there is no other automated correctness check.
- Deliver CRLF files (e.g. `navbar.css`) as complete file replacements, not diffs/patches — `git am`
  silently mis-handles CRLF line endings in this repo.
- No inline `style=` in HTML and no `style.display`/appearance toggling from JS (except
  `setProperty('--var')`) — use CSS classes and `data-*` attributes instead. Build DOM via element
  creation, not `innerHTML` with unescaped data.
- Comments in French, UI copy in EN/FR. CSS tokens as custom properties, converging on a shared
  `_shared/css/tokens.css` rather than per-app color values.
- **Pivot design principle**: the pivot format transcribes what a workflow does, it does not optimize
  it — the Builder should faithfully represent reality (e.g. "10 nodes that clearly show each step"
  is preferred over "5 nodes that bundle config"). A step that can't summarize itself is hiding
  something.
