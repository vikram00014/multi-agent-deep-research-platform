# UI

React 19 + TypeScript + Vite 8, styled with Tailwind v4 (via `@tailwindcss/vite`, no config
file — utilities only). Product name shown in the UI is **"Delve"**; the codebase and backend
are named Delve.

## Navigation model

The app is a **single linear flow**, not a tabbed workspace. `App.tsx:13` defines:

```ts
type View = 'idle' | 'running' | 'done';
```

The view is **derived, never user-selected** (`App.tsx:42`):

```
!currentSessionId          → 'idle'
effectiveComplete          → 'done'
otherwise                  → 'running'
```

A persistent left `<Sidebar>` (hidden below `md`) and a header with the status pill plus
Stop / Retry / New actions frame all three views.

> Historical note: an earlier revision had five tabs (New Research, Research Feed, Final Paper,
> Analytics, Resources) plus a floating Deep RAG chat. The Analytics and Resources tabs and the
> chat were removed along with `VisualInsights.tsx` and `ResearchChatFloating.tsx`.

## Views

**`idle`** (`App.tsx:202`) — hero, topic input with autofocus and Enter-to-submit, three example
topic chips, a paper-format picker (`ieee` / `academic` / `apa` / `acm` / `mla`), and optional
PDF upload.

**`running`** (`App.tsx:331`) — renders `<ResearchFeed>`.

**`done`** (`App.tsx:342`) — renders `<PaperViewer>`.

## Components

| File | Responsibility |
|---|---|
| `Sidebar.tsx` | Session list, polls `listSessions()` every 8 s, status icons, per-session delete (disabled while running), New Research button |
| `ResearchFeed.tsx` | 9-stage stepper, live/polling/reconnecting pill, elapsed timer, four stat tiles (Sources / Debates / Gaps / Elapsed) derived by counting feed item types, auto-scrolling event stream |
| `PaperViewer.tsx` | Fetches `getPaper` on completion, renders `final_draft \|\| paper` via react-markdown + remark-gfm, routes `mermaid` fences to `<Mermaid>`, Copy and Download-PDF buttons, format/citation/debate badges |
| `PdfUpload.tsx` | Drag-drop or browse multi-PDF upload with per-file state; reports only successfully uploaded `file_id`s upward |
| `Mermaid.tsx` | Module-scope mermaid singleton, parse-then-render with a graceful fallback card; mindmaps deliberately skipped |

The `ResearchFeed` stepper stages are `planner → retrieval → summarizer → proposer → critic →
cross_paper → gap_analysis → paper_architect → complete`.

## State and data flow

`App.tsx` holds `currentSessionId`, `topic`, `isStarting`, `uploadedFileIds`, `polledComplete`,
`paperFormat`, `sessionDetail`. `useWebSocket(sessionId)` supplies `isConnected`,
`isPollingFallback`, `feedItems`, `isComplete`, `error`, `warning`, `sendStop`.

The hook preloads the persisted timeline over HTTP, then opens `WS /ws/{id}`, reconnects on
drop, and degrades to polling if the socket cannot be established. Poll interval adapts —
60 s when done, 30 s when the socket is healthy, 6 s otherwise — and pauses when the tab is
hidden.

Completion is currently tracked four separate ways and OR'd together (WS `isComplete`,
`polledComplete`, `sessionDetail.status`, and a fourth check inside `ResearchFeed`).

## Configuration

`VITE_API_BASE` (read in `api.ts:1` and `useWebSocket.ts:6`) defaults to `''`, i.e. same-origin.
There is no `frontend/.env.example`, so behavior depends entirely on the proxy layer:

- Dev: `vite.config.ts` proxies `/research`, `/upload`, `/health`, `/resources`, `/ws` to
  `127.0.0.1:8000`.
- Container: `frontend/nginx.conf` proxies the same five prefixes to `http://backend:8000`.

## Known UI gaps

**Accessibility** — the weakest area, and systemic rather than incidental. There are currently
zero `aria-*`, `role=`, or `alt=` attributes anywhere in `src/`. Specifically:

- The PDF drop zone is a `<div onClick>` with no `role`, `tabIndex`, or key handler, and the real
  file input is `hidden` — the upload flow is entirely keyboard-inaccessible.
- Icon-only buttons (mobile new-session, remove-file, delete-session) have no accessible name.
- The topic input has a placeholder but no label.
- Format-picker buttons convey selection through colour and weight only.
- The live feed and status pill have no `aria-live`, so a screen reader announces nothing during
  a multi-minute run.

**Error surfacing** — start failure logs to the console with no user-visible feedback
(`App.tsx:65`). Six other call sites use silent `.catch(() => {})`, so Retry, Cancel, and Delete
can all fail invisibly. There is no error boundary.

**Empty states** — `PaperViewer` returns `null` for a falsy paper, rendering a blank card. A
completed session whose `final_draft` is empty produces an empty manuscript surface.

**Typing at the boundary** — `api.ts` functions return untyped `resp.json()`, and `PaperResult` /
`SessionDetail` lean on `Record<string, unknown>`, so consumers coerce with `String(...)`.
`PaperViewer.tsx:135` holds the only explicit `any`.

**Bundle size** — 542 kB main chunk. `mermaid` (which drags in cytoscape and katex) is the
dominant cost and is only needed for fenced diagram blocks in generated papers — a prime
`React.lazy` candidate.

**Tooling** — `package.json` has `dev` / `build` / `typecheck` / `preview`. No ESLint or
Prettier config, and no tests. `tsconfig.json` sets `noUnusedLocals: false`.
