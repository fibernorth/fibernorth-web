# Bore-ON ⇄ fibernorth.com integration handoff

Written for the Claude building the Bore-ON Design Center connection, on both
the Bore-ON side and this repo (`fibernorth/fibernorth-web`). Read this and
`CLAUDE.md` before touching anything.

## The goal

Bill's estimator draws a job on the map in the FiberNorth CRM, pushes it to
Bore-ON Design Center, finishes the engineering there (profile, depth, pits,
rods), and the finished design comes back to the CRM to price the quote and
show the plan on the customer's proposal. The customer accepts online and the
lead goes to Won.

## Stack and ground rules in this repo

- Next.js 16 App Router, TypeScript strict, Tailwind, Firebase (Firestore,
  Auth, Storage). Client SDK for admin UI subscriptions, Admin SDK in API
  routes and server actions. Hosting: Firebase App Hosting (serverless).
- Build check: `npm run build`, plus `npx vitest run` (the Bore-ON pieces are
  covered in `src/lib/bore-on/*.test.ts` and `src/services/bore-on-pairing.test.ts`).
- **Branching:** another Claude session works in this repo on branch
  `claude/directional-drilling-marketing-3c19sm`. Branch from `main`, open a
  PR, and keep your changes to the files listed below where possible so
  merges stay clean. Don't push to `main` directly.
- **Serverless gotcha:** anything not awaited before the response is returned
  can be dropped. Await every Firestore write in API routes.
- **Firestore gotcha:** `set()`/`update()` with a dotted key like `"a.b"`
  writes a literal field named `a.b` in some call shapes. Use nested objects.
- **Firestore rules deploy is manual** (Bill runs
  `firebase deploy --only firestore:rules,storage --project fn-underground`).
  Anything customer-facing or integration-facing must go through the Admin SDK
  in a route, never depend on client rules.
- Voice for anything customer-facing: plain, short, no AI tone, "directional
  drilling" not "boring".

## Auth patterns (use these, don't invent new ones)

- Admin API routes: `verifyApiAuth(request)` in `src/lib/api-auth.ts` (Bearer
  Firebase ID token, admin allowlist or `admin: true` custom claim).
- Server actions: `verifyServerActionCaller(token)` in
  `src/lib/server-action-auth.ts`.
- Generic CRUD server actions only touch collections in `ADMIN_COLLECTIONS`
  (`src/lib/admin-allowlist.ts`).
- Secrets live in Firestore `integrationSecrets/<name>` (admin-only rules),
  never in `siteSettings` (world-readable). Bore-ON's are at
  `integrationSecrets/boreOn`: `{ baseUrl, apiKey, webhookSecret }`. Normally
  filled by the **Connect to Bore-ON** button (below); the same fields can be
  typed by hand in Admin → Settings (`src/app/(admin)/admin/settings/page.tsx`).

## Connecting (one click)

Admin → Settings → **Connect to Bore-ON** (owner only). No key or secret is
ever copied by hand or put in a URL.

1. `POST /api/bore-on/connect/start` makes a one-time `state` and a PKCE
   verifier, keeps them in `integrationSecrets/boreOnPairing` (10 minutes), and
   sends the browser to `{base}/connect/crm?client=fibernorth&state=…&code_challenge=…`.
2. A Bore-ON admin signs in, picks the company and approves. Bore-ON mints a
   design key, registers this site's callback with a fresh signing secret, and
   returns the browser to `/api/bore-on/connect/callback?code=…&state=…`.
3. The callback checks `state`, then trades the code (with the verifier) for the
   key and secret server to server. They are saved to `integrationSecrets/boreOn`
   with an audit entry that never contains the values. The base address saved is
   the one the pairing started with, never one named in a response.
4. **Disconnect** (`/api/bore-on/connect/disconnect`) forgets the key and secret.
   Bore-ON's Admin → Integrations card can also revoke the paired app.

Bore-ON holds the callback and redirect addresses for `fibernorth` in a fixed
registry, so they must match `PAIRING_REDIRECT_URI` in `src/lib/bore-on/pairing.ts`.

## What exists today (outbound push)

- `src/app/api/bore-on/push/route.ts`: admin-only `POST { quoteId }`.
  Builds the payload from `quoteRequests/{quoteId}.mapAnnotation`, then
  `POST {baseUrl}/api/v1/designs` (or `PUT .../designs/{id}` if the quote
  already has `boreOnDesignId`) with `Authorization: Bearer <apiKey>`. Repeats
  are safe because the design is found by `externalRef`, not by an
  idempotency header. Expects back `{ designId, url }`. If the design was
  deleted in Bore-ON the push gets a 404; **Start over** on the quote
  (`/api/bore-on/unlink`) clears the link so the next send creates a new one. Writes
  `boreOnDesignId`, `boreOnUrl`, `boreOnPushedAt` on the quote and adds a
  history line to the linked lead.
- Payload shape (`buildPayload` in that file):
  ```json
  {
    "specVersion": 1,
    "externalRef": "fibernorth:quote:<quoteId>",
    "source": "fibernorth.com",
    "createdAt": "ISO",
    "job": { "customerName": "", "address": "", "serviceType": "", "pipeSize": "", "notes": "" },
    "map": {
      "center": { "lat": 0, "lng": 0 }, "zoom": 18,
      "borePaths": [{ "id": "bore-1", "service": "water", "points": [{ "lat": 0, "lng": 0 }], "segmentFeet": [0], "totalFeet": 0 }],
      "existingUtilities": [{ "service": "power", "points": [] }],
      "markers": [{ "type": "well", "position": { "lat": 0, "lng": 0 }, "label": "" }],
      "labels": [{ "position": { "lat": 0, "lng": 0 }, "text": "" }]
    }
  }
  ```
  Every run carries `segmentFeet`/`totalFeet`. Only the map is sent: ground
  and bore profiles stay in the CRM (so Bore-ON gives no rod count). A re-send
  overwrites the whole drawing in Bore-ON. Known gap: only the first bore
  path gets pit markers, so later runs of a multi-run quote are drawn as lines
  with no pits.
- The button: `src/components/admin/quote-workbench.tsx` ("Send to Bore-ON",
  "Open in Bore-ON →"). That component is embedded in the full-page quote
  screen `src/app/(admin)/admin/quotes/[id]/page.tsx`.

## Data model you'll touch

- `QuoteRequest` and `MapAnnotation`, `QuoteLine`, `Proposal` in
  `src/lib/types.ts`. Quote docs live in `quoteRequests`.
  - `quoteLines: { description, kind: "work" | "material", qty, unitPrice }[]`
  - `quotedPrice`: grand total. Tax: 6% on material lines only.
  - `leadId` links to `leads/{id}` (two-way with `lead.quoteId`).
  - `estimateStatus`: draft | sent | viewed | accepted | declined | expired.
- Pricing math: `computeLineTotals()` in `src/lib/proposal.ts`. Use it; don't
  duplicate tax logic.
- Internal rate sheet: `ratePrice()` in `quote-workbench.tsx` (≤100 ft
  $3,000, ≤200 ft $4,000, then +$8/ft). Never show it to customers.
- Leads: `src/lib/leads.ts` (`Lead`, `LeadActivity`). To log something on a
  lead, append to its `activity` array (`{ ts, type, text }`, type `"quote"`
  for design/pricing events) and set `updatedAt`.
- Proposals: `proposals/{token}` are **immutable snapshots** of a sent quote
  (`src/actions/quotes.ts` `sendProposal`). Never edit a sent proposal when a
  design changes. Update the quote, and the estimator re-sends, which creates
  a new version and supersedes the old link.

## What Bill wants the connection to do (inbound) — built, kept as the spec

1. **Get the finished design back into the quote.** When the design is saved
   or finalized in Design Center, the quote should get: final bore length per
   run, depth profile, entry/exit pit locations, rod count, estimated drill
   time, and any material takeoff (conduit by size and footage, hand holes,
   building entries, splices). Either a webhook from Bore-ON (preferred) or a
   "Pull from Bore-ON" button that calls `GET /api/v1/designs/{id}`.
   - Built: `src/app/api/bore-on/webhook/route.ts` (public, rate limited), plus
     "Pull from Bore-ON" (`/api/bore-on/pull`, `/api/bore-on/pull-all`). It verifies an HMAC signature with
     `integrationSecrets/boreOn.webhookSecret` (HMAC-SHA256 over
     `<timestamp>.<body>`, headers `x-boreon-timestamp` and `x-boreon-signature`),
     looks the quote up by `externalRef`, ignores a repeated `deliveryId`, reads
     the design back from Bore-ON, writes the `boreOnDesign` summary and logs a
     lead activity. A readback failure answers 503 so Bore-ON retries.
2. **Price from the design.** Turn the takeoff into `quoteLines` the estimator
   can still edit. Mark generated lines (e.g. `source: "auto"`, with a stable
   `key`) so a re-sync replaces auto lines but never overwrites lines the
   estimator changed (`source: "manual"`). Built in `src/lib/bore-on/reprice.ts`.
   Until Bill supplies unit prices (a rate card in Bore-ON), pricing falls back
   to the internal rate sheet (`ratePrice`, `src/lib/pricing.ts`).
3. **Show the plan to the customer.** If Bore-ON can give a plan image or
   PDF URL, snapshot it into the proposal at send time
   (`sendProposal` → `Proposal.planImageUrl`) and render it on
   `src/app/proposal/[token]/page.tsx` under the map. Customer-facing only:
   no internal pricing, rod counts are fine.
4. **Status in the CRM.** Show design status (pushed, in design, finalized)
   and a link on the quote screen next to the existing Bore-ON button.

## Files you'll most likely change here

- `src/app/api/bore-on/push/route.ts` (outbound payload)
- `src/app/api/bore-on/webhook/route.ts` (new, inbound)
- `src/components/admin/quote-workbench.tsx` (status, pull button, auto lines)
- `src/lib/types.ts` (add `boreOnDesign`, `planImageUrl`, line `source`/`key`)
- `src/actions/quotes.ts` (snapshot plan image into proposals)
- `src/app/proposal/[token]/page.tsx` (show the plan)
- `src/app/(admin)/admin/settings/page.tsx` (webhook secret, unit prices)
- `firestore.rules` (only if you add a collection; `pricing` admin-only)

## Done means

- `npm run build` passes.
- A quote pushed to Bore-ON, edited in Design Center, comes back with
  updated footage and auto-priced lines, and the estimator can still edit them.
- Re-sending the proposal shows the new price and plan; the old link says it
  was replaced.
- Nothing customer-facing exposes the rate sheet, unit costs, or notes.
