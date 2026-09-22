/**
 * FiberNorth lead sync — Google Apps Script for the marketing firm's Meta ads
 * lead tracker sheet.
 *
 * Every run: reads all lead rows from the first tab, POSTs them to
 * fibernorth.com, and writes Bill's pipeline statuses back into the tracker
 * columns (Lead Answered .. Total Sale) for rows Bill has worked in the admin.
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
 */

var ENDPOINT = "https://fibernorth.com/api/leads/sync";
var HEADER_ROW = 2;
var FIRST_COL = 1; // A
var LAST_COL = 17; // Q

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

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var lastRow = sheet.getLastRow();
  if (lastRow <= HEADER_ROW) return "No lead rows yet.";

  var range = sheet.getRange(HEADER_ROW + 1, FIRST_COL, lastRow - HEADER_ROW, LAST_COL);
  var values = range.getDisplayValues();

  var rows = [];
  var rowIndexByKey = {};
  values.forEach(function (v, i) {
    var row = {
      date: v[0], time: v[1], adSet: v[2], creative: v[3], serviceType: v[4],
      isOwner: v[5], name: v[6], phone: v[7], email: v[8], notes: v[9],
      answered: v[10], booked: v[11], taken: v[12], converted: v[13],
      objection: v[14], cash: v[15], sale: v[16],
    };
    if (!row.name && !row.phone && !row.email) return;
    rows.push(row);
    rowIndexByKey[keyFor(row)] = i;
  });

  var res = UrlFetchApp.fetch(ENDPOINT, {
    method: "post",
    contentType: "application/json",
    headers: { "X-Sync-Secret": secret },
    payload: JSON.stringify({ source: "meta-ads", rows: rows }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    var msg = "Sync failed (" + res.getResponseCode() + "): " + res.getContentText().slice(0, 200);
    Logger.log(msg);
    return msg;
  }

  var body = JSON.parse(res.getContentText());
  var written = 0;
  // Column letters for each tracker field. The server decides exactly which
  // cells may change (fill-blank or forward-only); this only applies them.
  var COL = { answered: 11, booked: 12, taken: 13, converted: 14, objection: 15, cash: 16, sale: 17 };
  (body.results || []).forEach(function (r) {
    if (r.writeBack !== "yes" || !r.set) return;
    var i = rowIndexByKey[r.externalId];
    if (i === undefined) return;
    Object.keys(r.set).forEach(function (field) {
      var col = COL[field];
      if (!col) return;
      sheet.getRange(HEADER_ROW + 1 + i, col).setValue(r.set[field]);
      written += 1;
    });
  });

  var summary =
    "Sent " + rows.length + " rows, " + (body.created || 0) + " new, " +
    (body.writeBackOn ? "wrote back " + written + " cells." : "write-back is off.");
  Logger.log(summary);
  return summary;
}

// Must match sheetExternalId() in src/lib/leads.ts.
function keyFor(row) {
  var digits = (row.phone || "").replace(/\D+/g, "");
  return "sheet:" + (row.date || "").trim() + "|" + (row.time || "").trim() + "|" + digits;
}
