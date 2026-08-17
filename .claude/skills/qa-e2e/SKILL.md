---
name: qa-e2e
description: Production end-to-end verification for fibernorth.com — the browser harness, network bridging tricks, test-data conventions, and the rule that no fix is "done" until a real browser proved it on the live site. Use before declaring any deploy, fix, or feature working.
---

# QA / E2E Verification for fibernorth.com

## The rule
Never declare a fix or feature live because the code merged, the build passed,
or an HTTP probe returned 200. **Done = a real browser exercised the flow on
https://fibernorth.com and the expected outcome was observed.** Claude reviewing
its own code is not verification; a browser observing production is.

## Environment facts (Claude Code cloud sandbox)
- Chromium lives at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
  (check `ls /opt/pw-browsers/` for the current version dir). Use
  `playwright-core` installed in a scratchpad npm project; never
  `playwright install`.
- Outbound HTTPS goes through an agent proxy the browser does not trust.
  Direct `page.goto` to external sites fails with ERR_CONNECTION_RESET.
  **Bridge every request through curl** (which honors the proxy + CA) via
  `page.route('**/*', ...)` — full working code in
  `references/prod-bridge.mjs`. Key gotchas the bridge must handle:
  - curl -i output through a proxy starts with one or more
    `HTTP/1.1 200 Connection established` blocks — strip them before
    parsing the real response.
  - Strip `content-encoding`/`transfer-encoding` from response headers and
    drop the request's `accept-encoding` header.
  - Launch Chromium with `--disable-web-security` so fulfilled cross-origin
    responses skip CORS preflight (Playwright cannot bridge preflights).
- Local dev server variant (localhost target, only Google APIs bridged):
  `references/qa-harness-localdev.mjs`. Remember: local dev has NO Firebase
  Admin credentials, so server-side writes 500 — reads work, writes must be
  tested against production.

## Driving the admin panel
- Admin pages hold a Firestore long-poll open: `networkidle` never settles.
  Use `waitUntil: 'domcontentloaded'` plus explicit `waitForTimeout` (~9s
  for data to stream in).
- Playwright actionability checks can hang on the live-updating pages.
  Dispatch interactions programmatically inside `evaluate`: set values via
  the native prototype setter, then dispatch `change`/`input` with
  `bubbles: true`; click buttons via `el.click()` in evaluate.
- Login: `https://fibernorth.com/login`, fields `#email` / `#password`,
  account `webadmin@fibernorth.com`. The password is NOT stored in this
  repo — get it from the owner or the QA_ADMIN_PASSWORD env var.

## Test-data conventions (non-negotiable)
- Every record a test creates is named with the prefix **`QA-TEST`**.
- Never modify, status-change, or delete records without that prefix —
  real customer quotes live in the same database.
- Clean up ALL QA-TEST records before finishing, even on failure. Fast
  path: Firestore REST with the webadmin idToken (sign in via
  `identitytoolkit accounts:signInWithPassword`, list the collection, delete
  docs whose `name` starts with QA-TEST). Pattern in
  `references/firestore-rest.md`.

## Deploy verification
- App Hosting rollouts take 5–10 min after a merge to main and HAVE silently
  stalled before. Do not trust chunk-grepping the HTML (client chunks load
  lazily). Verify with a feature probe instead: request a URL or content
  string that only exists in the new build (a new route returning 200, new
  copy in server-rendered HTML).
- fibernorth.com and www both serve the site; hosted.app 308-redirects.

## Edge-case checklist (run against any changed flow)
- Empty/missing data: fields absent from old records, empty collections
- Malformed input: oversized text, wrong types in optional fields
- Double-submit: click submit twice fast — one record or two?
- Failure visibility: kill the network mid-action — does the UI show an
  error, or fail silently? (Silent failure is a bug on this site, always.)
- Auth edges: expired session mid-action, non-admin account
- The GA4 `generate_lead` event fires only on real browser submits — API
  POSTs to /api/quote do not count as conversions.

## What "verified" looks like in a report
State the observed outcome, not the intent: "status persisted after reload:
true", "delete confirmed, record absent after refresh", "success card shown,
3 GA collect hits to G-6RYR5FJT1E". If a step could not be observed, say so —
never infer success from absence of errors.
