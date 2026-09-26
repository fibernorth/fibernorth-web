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
- **Recipient lists (recovered Sept 24 from session history):**
  `contractors/recipients-contractors.json` = the 94 mailed Sept 4 (original
  96 minus Windemuller and Cluff). `contractors/additions-verified.json` = 31
  of the later additions with verified addresses. `additions-rebuilt.json` =
  the rest, re-verified by a research pass (propane, HVAC, well drillers,
  outer-county plumbers, Benzie-Leelanau excavators), `additions-gaps.json` =
  91 more from a Sept 24 gap search (builders, plumbers, electricians,
  Missaukee). `recipients-master.json` = all 278; `recipients-additions-all.json`
  = the 184 that have NOT had letter 1. `FiberNorth-Contractor-List.csv` is
  the human-readable copy. CRM import file: `src/data/contractor-recipients.json`.
- **Letter 1 text (Bill's own):** `contractors/letter-1-text.md`. Voice
  reference for all contractor letters.
- **Letter 2:** `contractors/merge-print-contractors-2.js`, dated Oct 2, 2026.
  Modeled on letter 1: question opener, real numbers and equipment, P.S.
  Stands alone, no reference to letter 1. Peer tone, assumes they know what a
  directional drill is. Lead angle: we don't disturb driveways, lawns,
  landscaping, trees (Bill cut the winter/frost angle). Going to ALL 217 in
  the core counties (`recipients-master-core.json`).
- **County cut (Sept 24):** skip Missaukee, Wexford, Manistee for now. Letter 1 text recovered from Bill Sept 25.
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
Bill, Sept 25: "letters do not sound like a northern Michigan guy wrote it...
don't be AI." Write letters as plain paragraphs, no bold headings, no bullet
lists. Talk like a contractor to a contractor: concrete jobsite details
(paved driveway, row of trees, feed out to the barn), short sentences, a
little dry. Sign off "Thanks," not "Thanks for your time,".
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
- **Contact tracking (Sept 22):** every lead has lastContactAt (auto from
  call/text/email/walk/letter/quote), contactEveryDays, and nextActionAt as the
  check-back date (auto-filled from the frequency). "Stale" filter = past the
  frequency. Import panel on Leads: pull website quotes, add the 106
  campgrounds (letters 1+2 logged, every 14 days), log letter N mailed to all.
  Campground list for the import is `src/data/campground-recipients.json`
  (copy of marketing/campgrounds/recipients.json).
- **Sheet Notes + "answered" (Sept 25):** NOTES (col J) = latest log entry
  in the CRM ("9/25 Call: ..."). A note typed on the sheet is imported as a
  log entry (via "sheet") first, then stays as-is. Lead Answered = Yes only
  when Bill actually talked to them (a call or walk logged, or stage
  contacted/walk/quoted/won). Logging a call or walk moves New -> Contacted;
  a text or email does not. Script must be re-pasted after this change.
- **Sheet write-back safety:** ON by default (Bill 9/25: keep the firm's
  sheet current); can be switched off in Settings. Only
  fills blanks or moves forward (blank->Yes, No->Yes); never clears; never
  touches filled money/objection cells; every change logged on the lead
  once (sheetLastSet); our own NOTES text is remembered (sheetNoteWritten)
  so it isn't re-imported as a sheet note; duplicate row keys are skipped.
- **Sheet sync integrity (Sept 26):** rows keyed date|time|phone (email,
  then name, when there's no phone); a key that changes (phone typo fixed,
  Date column reformatted) is matched back to its lead by phone / email and
  every key is kept in `externalIds`; new sheet leads get a doc id hashed from
  the key (`create()`), so retries can't duplicate. Every firm note goes into
  the history (via sheet) before anything replaces it and is never written
  back cut short. The script reports each cell it actually wrote
  (`applied`); only those are logged "Sheet updated" and become ours
  (`sheetOwned`). A cell we wrote that still shows our value may be
  corrected backward (undo acceptance, reopen, sale change); cells the firm
  typed stay fill-blank / forward-only. Booked/Taken come from the walk
  (walk date, `walk_booked` / `walk` history), not from Quoted/Won. While
  Bill hasn't touched a lead, the firm's columns keep moving its stage
  forward. **Re-paste `marketing/tools/leads-sheet-sync.gs` after deploying**
  (the old script keeps working, but nothing gets logged or corrected).
- **Google Calendar:** OAuth (client id/secret from the fn-underground Cloud
  project, redirect https://fibernorth.com/api/google/oauth/callback), refresh
  token in integrationSecrets/googleCalendar. Walk date+time on a lead -> event
  on admin@fibernorth.com primary calendar (`src/lib/google-calendar.ts`). Bill
  shares that calendar with chris@ and office@ in Google Calendar settings.
- **Lead -> quote -> proposal (Sept 25, phases 1+2):**
  - Stage `not_a_lead` (with disqualifyReason) vs `lost` ("said no", with
    objection). Close-out chips on each lead card. Both drop off Due/Open/Stale;
    "All" hides not_a_lead (own chip). Sheet write-back maps not_a_lead to
    Converted "No" + objection "Not a lead: <reason>".
  - "Make a quote" button on every lead -> `ensureQuoteForLead`
    (src/actions/quotes.ts) -> full page `/admin/quotes/[id]` (workbench + send
    panel). Website quotes are linked lead<->quote both ways from creation.
  - Send = `sendProposal`: immutable snapshot in `proposals/{token}`, new version
    supersedes old link, email via Resend (from noreply, reply-to bill@), or
    copy/text link. Customer page `/proposal/<token>`: scope, map, lines, 6% tax
    on materials, standard terms (src/lib/proposal.ts STANDARD_TERMS), typed
    name + "I agree" to accept. Accept -> lead Won, saleAmount, "Schedule the
    job"; decline -> "Call about the declined quote". Slack/email notices.
  - Phase 3 (not built): auto-price from the drawing (hand holes, pits,
    building entries, splices, conduit by size) needs Bill's rate sheet.
- **Quote screen, Sept 25 (Bill's asks):**
  - Map: tap a bore point to delete it (right-click on desktop), tap the new
    line to delete it; Undo / Delete whole line always visible. Several new
    lines on one map, each with its own utility type ("+ Start another new
    line"; tap a finished line to edit or delete). Each run carries `service`
    in the annotation path; Bore-ON gets one borePath per run with its type.
  - Quote email now from bill@fibernorth.com (reply-to bill@fibernorth.com)
    and BCCs whoever clicked Send plus the Settings quote-email list.
    "Did they get it?" asks Resend whether it was delivered/bounced/spam.
  - After the first send the main button is "Send again" (same version).
    If the quote was edited since, it becomes "Send revised quote (vN)".
- **Email from the lead card (Sept 25):** pick "Email" when logging, check
  "Send this email from here", choose a starter (Checking in / Tried to call /
  Not ready yet, in src/lib/lead-email-templates.ts), edit, "Send & log". From
  bill@fibernorth.com, copy to the sender. Logged only if the send succeeds.
- **Sales round 2 (Sept 25, branch feat/sales-round2):**
  - Follow-up schedule (`src/lib/cadence.ts`), suggested only, nothing
    auto-sends. New leads (not letter lists): day 0 call + text, day 1 call,
    day 3 text. Quotes: day 2 text, day 5 call, day 12 email, day before the
    quote expires (email; text if no email on file). Won + "Job done": ask
    for a Google review 2 days later. Logging a touch or sending a quote
    moves the lead's next action to the next step, unless Bill set his own
    next action for a later day (then it's left alone). The lead card shows
    "Next touch" with one tap to Messages (sms: with a starter), the dialer,
    or the email box with a starter. Starters live in
    `src/lib/lead-email-templates.ts` (emails: Quote follow-up, Quote
    expiring, Ask for a review; plus short texts signed "Bill, FiberNorth").
  - Referral partners: on a lead's card, "Referred by a partner?" searches
    contractor-letter leads (and anyone already credited). Fee default 10%
    of the sale; won jobs show "fee owed" with Mark paid. Partner cards show
    jobs sent, won and dollars.
  - Dashboard: leads to call today by source, open quotes (count, $, oldest,
    expiring this week), 90-day win rate on quotes sent, $ won this month +
    average job, cost per won job by source. Monthly spend is typed in on
    the dashboard and stored in `marketingSpend/{YYYY-MM}`.
  - Proposal page: "What happens next" before Accept, up to 3 reviews from
    Admin -> Testimonials (4+ stars, visible only; the block hides when
    there are none), one real job photo reused from /why-trenchless,
    "Terms" heading, "Bore plan" caption.
  - Settings -> Company Information -> Google review link.
  - **Deploy:** `firebase deploy --only firestore:rules` (adds the admin-only
    `marketingSpend` rule). The dashboard reads/writes spend through the
    server, so it works before the deploy; the rule just keeps the
    collection locked to admins.

### TODO for Bill (sales round 2)
- [ ] **Workmanship warranty.** The proposal has none (`STANDARD_TERMS` in
  `src/lib/proposal.ts`). Tell us what you stand behind (how long, on what:
  the bore, the pits, settling, restoration) and it goes in as one plain line.
- [ ] **Deposit / payment terms.** Today the only line is "Payment is due on
  completion unless we agree otherwise in writing." If you take a deposit
  (how much, when, how: check, card, ACH) or want net terms for contractors,
  give us the wording.
- [ ] **Google review link.** Paste it in Admin -> Settings (Google Business
  Profile -> Ask for reviews -> copy link). Until then the review starters say
  "search FiberNorth Underground on Google".
- [ ] **Reviews for the proposal page.** Add real ones in Admin ->
  Testimonials (visible, 4-5 stars). None are invented.
- [ ] **Check the starter wording** (texts and the three new emails) and the
  "What happens next" steps (MISS DIG "about three working days", "most jobs
  are one day on site") match how you actually work.
- [ ] **Schedule choices** worth a look: day 3 for new leads is a text
  ("still want a quote?"); the day-before-expiry touch is an email; untouched
  new leads older than 21 days drop off the schedule; letter-list leads
  (campground / contractor) are not on it.
- [ ] **Referral fee:** 10% of the total sale (including materials and tax)
  unless changed per job. Say if it should be on work only.
