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

### Campground campaign (6-letter series, mailed monthly-ish)
- **Audience:** campgrounds/RV parks, US-10 north to the Mackinac bridge.
- **Vanity URL on the letters:** `fibernorth.com/camp` (+ QR). Tracked; visits
  show on the admin dashboard. Anthropic/Coli network visits are filtered out.
- **Recipient list:** `campgrounds/recipients.json`
  (fields: Owner_First, Owner_Name, Campground_Name, Address, City, State, Zip).
  **STATUS: needs to be re-seeded** — see "Recovering the lists" below.
- **Letter 1** (mailed Sept 4, 2026): intro — Bill Gaylord, founder; bandwidth
  vs signal; keep-your-WiFi-company; GPS locating; free fall walk offer.
  Verbatim text is locked; generator was `merge-print.js`.
- **Letter 2** (`campgrounds/merge-print-2.js`): the reviews hook + Bill's
  20-year story (dialup -> wireless -> fiber) + localness. Dated Sept 18, 2026.
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
