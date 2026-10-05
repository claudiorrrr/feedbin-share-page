# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `bun install`
- `bun run dev`: watch mode, loads `.env` (copy `.env.example`)
- `bun run start`
- `bun run typecheck`: `tsc --noEmit`

No test runner or linter. `server.ts` throws at import if `FEEDBIN_EMAIL`, `FEEDBIN_PASSWORD` or `SHARE_URL` is unset, so only typecheck runs without credentials. Optional env: `ADMIN_PASSWORD`, `HOST`, `PORT`, `FEEDBIN_PAGES_FEED_ID`, and `LINKS_FILE` / `HIGHLIGHTS_FILE` / `COMMENTS_FILE` / `MANUAL_FILE` (default `data/*.json`, relative to the working directory).

## Architecture

Bun HTTP server, no framework, no database, no client build. HTML, CSS and browser JS are template strings in `src/views.ts`. State is four JSON files in `data/`, loaded once at startup and kept in memory (hand edits need a restart).

Security model drives the design:
- `server.ts` routes `/s/:token` and `/robots.txt` first (public), then everything else goes through `isAuthorized` (basic auth if `ADMIN_PASSWORD` is set, otherwise the reverse proxy must protect it) into `adminRoute`. A new admin route is protected automatically; a public one must live under `/s/`.
- The public page has a strict CSP and runs no script. Anything it needs must be CSS or plain HTML (the comment popover is `:hover`/`:focus` on `mark.cm::before`). Admin pages get a per-response nonce CSP (`adminCsp`) allowing only the inline script with that nonce plus same-origin `fetch`.
- State-changing admin routes are POST-only and reject `sec-fetch-site` other than same-origin.
- The server fetches arbitrary URLs for "Add a URL" (`POST /add`). Only the authenticated admin reaches it.

Data flow:
- `feedbin.ts`: API client, 60 s caches. Finds the Pages feed or uses `FEEDBIN_PAGES_FEED_ID`; rejects entries from other feeds. Empty content falls back to Feedbin's extractor, then `extract.ts`.
- `extract.ts`: `extractPage(url)` fetches then calls `parseArticle(html, url)` (Readability + linkedom). `parseArticle` is also used on HTML the browser sends.
- `manual.ts`: pages added by URL or bookmarklet. Same `Entry` shape as Feedbin entries, `feed_id === MANUAL_FEED_ID` (0), id = `Date.now()`. Content is a snapshot. `server.ts` `findEntry` and `allEntries` merge both sources, so share links, highlights, comments and clicks work on either.
- Bookmarklet: built client-side in `adminScript` from `location.origin`; opens `/import`, which accepts `postMessage` only from `window.opener`, shows a Save button, then `POST /add-html`. Needed because sites like NYTimes (DataDome) answer server fetches with 403.
- `share.ts` `LinkStore`: tokens in JSON. Revoke deletes the row. Expired links kept 30 days so visitors see "expired". `clicks` is optional on old rows; `click(token)` runs only when the article renders.
- `highlights.ts`: `HighlightStore<T>` keyed by entry id, storing text quotes (exact + prefix/suffix), not offsets. Reused for comments (`HighlightStore<Comment>`, adds `text`). Highlights and comments are separate stores and separate UI on purpose.
- `mark.ts`: re-finds each quote in the article's text and wraps text nodes in `<mark>` server-side. Highlights are `.hl`; comments are `.cm` with `data-text` and, on the public page only, `tabindex=0`. Comment numbers `[n]` are drawn by CSS `::after` from `data-n`, not inserted as text, so they never shift text offsets. `MarkMode.Admin` adds `data-id`.

## Gotchas

- Browser scripts live inside TS template literals: no backticks or `${`, and backslashes are doubled (`\\s`). Validate edits by rendering the page and `new Function(script)`.
- The admin highlight script and `mark.ts` both compute offsets over the article's concatenated text nodes. Keep their whitespace handling in sync or marks land in the wrong place.
- `esc()` must wrap every interpolated value in HTML. `data-text` goes through the linkedom serializer, which escapes only quotes, so `mark.ts` escapes `&` itself.
- Run from the directory that holds `.env` and `data/`; the data paths are relative to the working directory.
