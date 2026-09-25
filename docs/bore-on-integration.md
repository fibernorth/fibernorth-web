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
- Build check: `npm run build`. There is no test suite; the build is the gate.
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
  `integrationSecrets/boreOn`: `{ baseUrl, apiKey }`, edited in
  Admin → Settings (`src/app/(admin)/admin/settings/page.tsx`). Add
  `webhookSecret` there if you add an inbound webhook.

## What exists today (outbound push)

- `src/app/api/bore-on/push/route.ts`: admin-only `POST { quoteId }`.
  Builds the payload from `quoteRequests/{quoteId}.mapAnnotation`, then
  `POST {baseUrl}/api/v1/designs` (or `PUT .../designs/{id}` if the quote
  already has `boreOnDesignId`) with `Authorization: Bearer <apiKey>` and an
  `Idempotency-Key`. Expects back `{ designId, url }`. Writes
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
    },
    "terrain": { "samples": 60, "distFt": [], "elevFt": [], "sourceDatum": "USGS 3DEP 1m, NAVD88 feet" }
  }
  ```
  Only the first bore path carries `segmentFeet`/`totalFeet` today. Change the
  payload freely if Bore-ON needs something different; this route is the only
  sender.
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

## What Bill wants the connection to do (inbound)

1. **Get the finished design back into the quote.** When the design is saved
   or finalized in Design Center, the quote should get: final bore length per
   run, depth profile, entry/exit pit locations, rod count, estimated drill
   time, and any material takeoff (conduit by size and footage, hand holes,
   building entries, splices). Either a webhook from Bore-ON (preferred) or a
   "Pull from Bore-ON" button that calls `GET /api/v1/designs/{id}`.
   - Suggested inbound route here: `src/app/api/bore-on/webhook/route.ts`,
     public, verifies an HMAC signature with
     `integrationSecrets/boreOn.webhookSecret`, looks the quote up by
     `externalRef`/`boreOnDesignId`, writes a `boreOnDesign` summary object on
     the quote, and logs a lead activity. Rate-limit it and await all writes.
2. **Price from the design.** Turn the takeoff into `quoteLines` the estimator
   can still edit. Mark generated lines (e.g. `source: "auto"`, with a stable
   `key`) so a re-sync replaces auto lines but never overwrites lines the
   estimator changed (`source: "manual"`). Bill still needs to supply unit
   prices for hand holes, pits, building entries, splices, and conduit by
   size. Put them in an admin-only `pricing/current` doc with a Settings
   card; don't hardcode them.
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
