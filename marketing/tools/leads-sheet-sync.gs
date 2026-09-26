/**
 * FiberNorth lead sync — Google Apps Script for the marketing firm's Meta ads
 * lead tracker sheet.
 *
 * Every run: reads all lead rows from the first tab, POSTs them to
 * fibernorth.com, and (only when write-back is switched on in the FiberNorth
 * admin) writes the specific cells the server says may change.
 *
 * INSTALL (once, ~2 minutes):
 *   1. Open the sheet -> Extensions -> Apps Script. Delete any sample code,
 *      paste this whole file, save.
 *   2. Run `setup` once from the toolbar. Approve the permissions prompt.
 *      It asks for the sync secret: paste the same value you saved under
 *      Admin -> Settings -> Lead sync secret on fibernorth.com.
 *   3. Done. It runs every 10 minutes and also right after any edit.
 *
 * Column layout (row 2 is the header, data starts row 3):
 *   A Date · B Time · C Ad Set · D Creative · E Line type · F Owner? ·
 *   G Name · H Phone · I Email · J NOTES · K Lead Answered ·
 *   L Booked Appointment · M Taken Appointment · N Client Converted ·
 *   O Objection · P Cash Collected · Q Total Sale (LTV)
 *
 * Safety rules for write-back (server decides WHAT, this script decides IF):
 *   - only cells listed under r.set are touched, nothing else
 *   - the server only asks to lower or clear a cell that WE wrote and that
 *     still shows exactly what we wrote (e.g. a customer's acceptance was
 *     undone); anything the firm typed only ever fills blanks / moves forward
 *   - NOTES (col J) is set to the latest log entry from the CRM; a note typed
 *     here is pulled into the CRM as a log entry first, so nothing is lost
 *   - each row is re-found by its key (Date+Time+Phone, or Email / Name when
 *     there's no phone) AFTER the request, so sorting or inserting rows
 *     during the sync can't misplace a write
 *   - rows whose key is missing or duplicated are skipped
 *   - a cell that changed while the request was in flight is skipped
 *   - a cell with data validation (dropdown/checkbox) is written only if the
 *     value is one the validation allows
 *   - every cell actually written is reported back to fibernorth.com
 *     ("applied"), which logs it on the lead; if that report can't be sent it
 *     is kept and sent with the next run
 *   - a value starting with = + - @ is written as plain text, never a formula
 *   - LockService keeps two syncs from running at once
 *
 * UPDATING: paste this whole file over the old one and save. No need to run
 * setup again (the secret and triggers are kept).
 */

var ENDPOINT = "https://fibernorth.com/api/leads/sync";
var HEADER_ROW = 2;
var FIRST_COL = 1; // A
var LAST_COL = 17; // Q
// Tracker field -> column number. Must match the server's result keys.
var COL = { notes: 10, answered: 11, booked: 12, taken: 13, converted: 14, objection: 15, cash: 16, sale: 17 };
// Cell writes the server hasn't heard about yet (sent with the next run).
var PENDING_KEY = "FN_PENDING_APPLIED";

function setup() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt(
    "FiberNorth lead sync",
    "Paste the sync secret from fibernorth.com Admin -> Settings:",
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var secret = (resp.getResponseText() || "").trim();
  if (!secret) {
    ui.alert("No secret entered. Run setup again.");
    return;
  }
  PropertiesService.getScriptProperties().setProperty("FN_SYNC_SECRET", secret);

  // Replace any earlier triggers so we never double-run.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "syncLeads") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("syncLeads").timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger("syncLeads")
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onChange()
    .create();

  var result = syncLeads();
  ui.alert("Connected. " + result);
}

function syncLeads() {
  var secret = PropertiesService.getScriptProperties().getProperty("FN_SYNC_SECRET");
  if (!secret) return "Not set up: run setup first.";

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return "Another sync is running; skipped.";

  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var snapshot = readRows_(sheet);
    var pending = readPending_();
    if (snapshot.rows.length === 0 && pending.length === 0) return "No lead rows yet.";

    var res = post_(secret, { source: "meta-ads", rows: snapshot.rows, applied: pending });
    if (res.getResponseCode() !== 200) {
      var msg = "Sync failed (" + res.getResponseCode() + "): " + res.getContentText().slice(0, 200);
      Logger.log(msg);
      return msg;
    }
    // The server has the earlier writes now.
    if (pending.length) PropertiesService.getScriptProperties().deleteProperty(PENDING_KEY);
    var body = JSON.parse(res.getContentText());

    var written = 0;
    var skipped = 0;
    var applied = [];
    if (body.writeBackOn) {
      // Re-read AFTER the request so writes land on the row as it is now.
      var current = readRows_(sheet);
      (body.results || []).forEach(function (r) {
        if (r.writeBack !== "yes" || !r.set) return;
        var sentIdx = snapshot.index[r.externalId];
        var nowIdx = current.index[r.externalId];
        // Missing now, or ambiguous (duplicate key) then or now: skip.
        if (sentIdx === undefined || nowIdx === undefined || sentIdx === -1 || nowIdx === -1) {
          skipped += 1;
          return;
        }
        var rowNumber = HEADER_ROW + 1 + nowIdx;
        Object.keys(r.set).forEach(function (field) {
          var col = COL[field];
          if (!col) return;
          var sentVal = String(snapshot.values[sentIdx][col - 1] || "");
          var nowVal = String(current.values[nowIdx][col - 1] || "");
          // Someone edited this cell while we were talking to the server.
          if (sentVal !== nowVal) {
            skipped += 1;
            return;
          }
          var value = String(r.set[field] == null ? "" : r.set[field]);
          if (nowVal === value) return;
          var cell = sheet.getRange(rowNumber, col);
          if (!valueAllowed_(cell, value)) {
            skipped += 1;
            return;
          }
          // Never let a CRM value become a formula (e.g. an objection that
          // starts with "="): sheetSafe_ adds a leading ' so Sheets stores
          // it as plain text. The ' is not shown in the cell, so the value
          // reported below via getDisplayValue() is exactly `value` and the
          // server's "we wrote this" comparison still matches.
          cell.setValue(sheetSafe_(value));
          written += 1;
          applied.push({ key: r.externalId, col: field, value: "", at: new Date().toISOString(), _cell: cell });
        });
      });
    }

    if (applied.length) {
      SpreadsheetApp.flush();
      // Report what the cells SHOW now, so later runs can tell our value
      // from one the firm typed.
      var report = applied.map(function (a) {
        return { key: a.key, col: a.col, value: String(a._cell.getDisplayValue()), at: a.at };
      });
      var ok = false;
      try {
        var res2 = post_(secret, { source: "meta-ads", rows: [], applied: report });
        ok = res2.getResponseCode() === 200;
      } catch (e) {
        ok = false;
      }
      if (!ok) savePending_(report);
    }

    var summary =
      "Sent " + snapshot.rows.length + " rows, " + (body.created || 0) + " new, " +
      (body.writeBackOn
        ? "wrote back " + written + " cell(s)" + (skipped ? ", skipped " + skipped : "") + "."
        : "write-back is off.");
    Logger.log(summary);
    return summary;
  } finally {
    lock.releaseLock();
  }
}

function post_(secret, payload) {
  return UrlFetchApp.fetch(ENDPOINT, {
    method: "post",
    contentType: "application/json",
    headers: { "X-Sync-Secret": secret },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}

function readPending_() {
  var raw = PropertiesService.getScriptProperties().getProperty(PENDING_KEY);
  if (!raw) return [];
  try {
    var list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function savePending_(report) {
  // Script properties hold ~9KB per value: keep the newest, cap long notes.
  var all = readPending_().concat(report).map(function (a) {
    return { key: a.key, col: a.col, value: String(a.value).slice(0, 1500), at: a.at };
  });
  while (all.length && JSON.stringify(all).length > 8500) all.shift();
  PropertiesService.getScriptProperties().setProperty(PENDING_KEY, JSON.stringify(all));
}

/**
 * Read all data rows. Returns { rows: [payload rows], values: [raw rows],
 * index: { key -> row offset, or -1 when the key appears more than once } }.
 * `rows` only holds rows with some contact info; `values`/`index` cover every
 * row so offsets map straight to sheet row numbers.
 */
function readRows_(sheet) {
  var lastRow = sheet.getLastRow();
  var out = { rows: [], values: [], index: {} };
  if (lastRow <= HEADER_ROW) return out;
  var values = sheet
    .getRange(HEADER_ROW + 1, FIRST_COL, lastRow - HEADER_ROW, LAST_COL)
    .getDisplayValues();
  out.values = values;
  values.forEach(function (v, i) {
    var row = {
      date: v[0], time: v[1], adSet: v[2], creative: v[3], serviceType: v[4],
      isOwner: v[5], name: v[6], phone: v[7], email: v[8], notes: v[9],
      answered: v[10], booked: v[11], taken: v[12], converted: v[13],
      objection: v[14], cash: v[15], sale: v[16],
    };
    if (!row.name && !row.phone && !row.email) return;
    var key = keyFor(row);
    row.key = key;
    out.rows.push(row);
    out.index[key] = out.index.hasOwnProperty(key) ? -1 : i;
  });
  return out;
}

/**
 * Formula-injection guard for every value we write. Text starting with
 * = + - @ (or a tab / carriage return) gets a leading apostrophe, which
 * Sheets treats as "store as text" and does not display. Text that itself
 * starts with ' gets one too, so the cell shows it as sent. Plain numbers
 * like -250 or 1500.50 are left alone so they stay numbers.
 * Must match sheetSafe() in src/lib/sheet-safe.ts.
 */
function sheetSafe_(value) {
  var s = String(value == null ? "" : value);
  if (/^[-+]?\d+(\.\d+)?$/.test(s)) return s;
  return /^[=+\-@\t\r']/.test(s) ? "'" + s : s;
}

/** Respect dropdown / checkbox validation on a cell. */
function valueAllowed_(cell, value) {
  // Clearing a cell is always allowed (a blank passes any dropdown).
  if (String(value).trim() === "") return true;
  var rule = cell.getDataValidation();
  if (!rule) return true;
  var type = rule.getCriteriaType();
  var args = rule.getCriteriaValues();
  var T = SpreadsheetApp.DataValidationCriteria;
  if (type === T.VALUE_IN_LIST) {
    var list = (args[0] || []).map(function (x) { return String(x).trim().toLowerCase(); });
    return list.indexOf(String(value).trim().toLowerCase()) !== -1;
  }
  if (type === T.VALUE_IN_RANGE) {
    var allowed = args[0].getDisplayValues().map(function (r) { return String(r[0]).trim().toLowerCase(); });
    return allowed.indexOf(String(value).trim().toLowerCase()) !== -1;
  }
  if (type === T.CHECKBOX) {
    var v = String(value).trim().toLowerCase();
    return v === "yes" || v === "no" || v === "true" || v === "false";
  }
  // Other validations (dates, numbers, custom formulas): let the sheet decide;
  // Sheets rejects invalid input on strict rules and warns on soft ones.
  return true;
}

// Must match sheetRowKey() in src/lib/leads.ts:
//   sheet:<date>|<time>|<phone digits>, or when the phone is blank
//   sheet:<date>|<time>|e:<email, lowercase>, else sheet:<date>|<time>|n:<name, lowercase>
function keyFor(row) {
  var digits = String(row.phone || "").replace(/\D+/g, "");
  var email = String(row.email || "").trim().toLowerCase();
  var name = String(row.name || "").trim().toLowerCase().replace(/\s+/g, " ");
  var tail = digits ? digits : email ? "e:" + email : "n:" + name;
  return "sheet:" + String(row.date || "").trim() + "|" + String(row.time || "").trim() + "|" + tail;
}
