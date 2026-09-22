# FiberNorth Marketing Workspace

This folder is the **durable home** for FiberNorth's direct-mail and marketing
campaigns. It lives in the git repo on purpose: the working scratch space used
during a session is temporary and gets wiped when the container recycles, so
anything that must survive (recipient lists, letter text, the scripts that
build the print files) belongs here, committed and pushed.

**Rule of thumb:** source data + generator scripts live here and are small.
The heavy print-ready outputs (multi-page .docx of 100+ letters, envelope
files, big PNGs) are **regenerated on demand** from these — don't commit those,
just rebuild them with the scripts below.

---

## Campaigns

### Campground campaign (6-letter series, every TWO weeks)
- **Schedule (reminders are set in this session's Routines):** L1 Sept 4 (mailed),
  L2 Sept 18, L3 Oct 2, L4 Oct 16, L5 Oct 30, L6 Nov 13. Each reminder also
  says to draft the next letter a week ahead. Remaining letter ideas:
  L3 water/power/sewer ride-along, L4 reviews and bookings, L5 how the work
  happens / no torn-up sites, L6 one offer + proof from a park we have done.
- **Audience:** campgrounds/RV parks, US-10 north to the Mackinac bridge.
- **Vanity URL on the letters:** `fibernorth.com/camp` (+ QR). Tracked; visits
  show on the admin dashboard. Anthropic/Coli network visits are filtered out.
- **Recipient list:** `campgrounds/recipients.json`
  (fields: Owner_First, Owner_Name, Campground_Name, Address, City, State, Zip).
- **Letter 1** (mailed Sept 4, 2026): intro — Bill Gaylord, founder; bandwidth
  vs signal; keep-your-WiFi-company; GPS locating; free fall walk offer.
  Verbatim text saved in `campgrounds/letter-1-text.md` (108 mailed; list is
  `recipients-wave1-full.json`).
- **Letter 2** (`campgrounds/merge-print-2.js`): continues letter 1's wireless
  -> fiber thread in PLAIN language (Bill: "simpler talk"). Two readers: hands-on
  owners who know the problem but not the fix, and staff at absentee-owned parks
  who need a one-pager to hand the owner. Includes Bill's 20-year ISP story
  (dialup -> wireless -> fiber) and localness. Dated Sept 18, 2026. 106 letters.
- **Wave-1 list** (106 after removals) is `campgrounds/recipients.json`;
  `recipients-wave1-full.json` is the 108 as mailed Sept 4.
- **Candidates not yet mailed:** `campgrounds/candidates-not-yet-mailed.json`
  (74 verified private parks from a Sept 17 research pass that were NOT in
  wave 1; `candidates-research-146.json` is the full research list). If Bill
  wants to add them, they get letter 1 first, not letter 2.
- **Removals from the campground list (do NOT mail these):**
  - Mackinaw KOA — Bill is working a deal directly (removed Sept 17, 2026)
  - Holiday Park Campground — Bill is working a deal directly (quote sent)

### Contractor campaign (sub/refer relationships)
- **Audience:** contractors who bury lines, in 9 counties ONLY: Grand Traverse,
  Kalkaska, Antrim, Charlevoix, Leelanau, Benzie, Wexford, Missaukee, Manistee
  (roughly 50 miles of Traverse City).
- **Vanity URL:** `fibernorth.com/pros` (+ vCard QR that saves Bill's contact).
- **Recipient lists:** `contractors/recipients-contractors.json` (original ~94)
  and the 74 vetted additions. **STATUS: needs re-seeding.**
- **Letter text:** cold intro — "I'm Bill Gaylord..."; two ways to make money
  (mark up the sub, or 10% referral, or both); why us; what we get under.
- **Removed as NOT prospects (competitors / direct relationships):**
  Windemuller, Cluff Well Drilling, Teall Excavating, Matt's Underground
  Utility Construction. (MDC Contracting flagged as a maybe — Bill to confirm.)
- **Warm contacts** (contractors Bill has already talked to): keep mailing, but
  a SHORTER "good talking, keep me in mind, call me next bore" touch — not the
  cold intro again.

---

## Assets (regenerate, don't hand-edit)
- **Logo:** repo `public/logo/` (light = dark text; dark = white text).
- **Signature:** designed blue cursive "Bill Gaylord" in Homemade Apple
  (`assets/HomemadeApple.ttf`). NOT Bill's real signature — he does not share
  it. Regenerate with `tools/gen-signature.py`.
- **QR codes:** regenerate with `tools/gen-qr.py`
  (camp -> fibernorth.com/camp, pros -> fibernorth.com/pros,
  vcard -> saves Bill's contact, last name "Gaylord - Boring Contractor").

- **Envelopes:** `tools/gen-envelopes.py <recipients.json> <out.docx>` builds
  #10 envelopes (9.5 x 4.125 in), printed return address, handwritten-look
  delivery address in Homemade Apple blue ink. One envelope per page.

## Contact block used on letters/cards
Bill Gaylord, Owner · Cell (231) 944-6471 · Office (231) 264-0757 ·
bill@fibernorth.net · fibernorth.com · 6227 Arnold Rd, Williamsburg, MI 49690

## Voice rules (see .claude/skills/marketing-review)
Plain, direct, a little dry. Short sentences, fragments OK. No AI tells:
no em-dashes, no "not just X, it's Y", no triple-parallel lists, no
seamless/robust/elevate, no exclamation points. Term is "directional
drilling," not "boring," on cards/proposals (the website keeps customer
search terms like "bore under driveway").

## Recovering the lists
If `recipients*.json` is missing (container recycle), the authoritative
wave-1 lists live in files already delivered to Bill in chat:
the campground mail-merge CSV, the letter-1/letter-2 print-ready .docx, or the
workspace backup zip. Re-seed from any of those, then commit the JSON here so
it persists.

---

## Lead pipeline (CRM) — built Sept 22, 2026
- Admin -> Leads (`src/app/(admin)/admin/leads/page.tsx`), collection `leads`,
  shared types in `src/lib/leads.ts`. Stages: new, contacted, walk_scheduled,
  walk_done, quoted, won, nurture (long term), lost. Every lead has a next
  action + date; "Due" filter and the dashboard tile show what is overdue.
- **Sources feeding it:** website quote form (auto, linked by quoteId);
  Meta ads lead sheet from the marketing firm (Google Sheet
  172B8uyxugykc1fpPIz3JYWkJN326gJMcrvVzpTEtnU0, first tab, header row 2);
  hand-added (phone, letters, referrals).
- **Sheet sync:** `marketing/tools/leads-sheet-sync.gs` (Apps Script pasted
  into the sheet, runs every 10 min + on change) POSTs rows to
  `/api/leads/sync` with header X-Sync-Secret = integrationSecrets/leadsSync.
  Rows keyed by date|time|phone. Bill's stage writes BACK to the firm's
  columns K..Q (Lead Answered .. Total Sale) once he has touched the lead.
  Slack ping on each new sheet lead (uses the quote Slack webhook).
- **Bore-ON:** push still lives on the quote workbench; the linked lead gets a
  history entry and boreOnUrl. Still waiting on Bill's base URL + test key.
- **Users:** Admin -> Users adds Firebase Auth users with an `admin: true`
  custom claim (rules + server checks honor it). Owner accounts are the
  hardcoded allowlist and can't be removed from the UI.
- **Phone app:** the site ships a web manifest (`public/manifest.webmanifest`,
  icons in `public/icons`). Bill installs it from Safari/Chrome "Add to Home
  Screen"; it opens on /admin/leads.
- **Voice assistant:** mic button on every admin page
  (`src/components/admin/voice-assistant.tsx`). Browser speech recognition ->
  `/api/assistant` (Claude Opus 5, tools in `src/lib/assistant-tools.ts`) ->
  plan of pipeline changes shown on screen -> Confirm -> apply. Never writes
  without the confirm tap. Key: integrationSecrets/anthropic.apiKey (Settings)
  or ANTHROPIC_API_KEY env.
- **Leads page fallback:** if client Firestore reads are denied (rules not
  published), it reads through `/api/admin/leads` (Admin SDK) and shows a note.
