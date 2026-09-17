#!/usr/bin/env node
/**
 * Campground letter #2 of the 6-letter series.
 *
 * Continues letter #1's thread in plain language: the WiFi boxes on the poles
 * are fed by a wireless link that fills up; the fix is fiber to the poles.
 * Written for two readers: hands-on owners (know the problem, not the fix)
 * and staff at absentee-owned parks (need something to hand the owner).
 *
 * Regenerate from the repo root:  node marketing/campgrounds/merge-print-2.js
 * Reads marketing/campgrounds/recipients.json; writes one letter per page.
 * Needs the `docx` package plus assets/qr-camp.png and assets/signature-hand.png
 * (regenerate those with the tools/ scripts).
 */
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, BorderStyle, LevelFormat,
  AlignmentType, Table, TableRow, TableCell, WidthType,
} = require("docx");

const HERE = __dirname;
const REPO = path.resolve(HERE, "..", "..");
const ASSETS = path.resolve(HERE, "..", "assets");
const DATE = "September 18, 2026";

const logo = fs.readFileSync(path.join(REPO, "public/logo/fibernorth-logo-light.png"));
const qr = fs.readFileSync(path.join(ASSETS, "qr-camp.png"));
const signature = fs.readFileSync(path.join(ASSETS, "signature-hand.png"));
const recipients = JSON.parse(fs.readFileSync(path.join(HERE, "recipients.json"), "utf8"));

const BODY = { font: "Georgia", size: 22 };
const t = (text, extra = {}) => new TextRun({ text, ...BODY, ...extra });
const p = (children, opts = {}) => new Paragraph({ children, spacing: { after: 150, line: 264 }, ...opts });
const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const CELL = { top: NB, bottom: NB, left: NB, right: NB };

function letterhead() {
  return [
    new Paragraph({ children: [new ImageRun({ type: "png", data: logo, transformation: { width: 190, height: 71 } })] }),
    new Paragraph({
      children: [new TextRun({ text: "Directional Drilling · Fiber Construction · Williamsburg, Michigan · (231) 264-0757 · fibernorth.com", font: "Georgia", size: 17, color: "666666" })],
      spacing: { after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "E8672A", space: 6 } },
    }),
    new Paragraph({ children: [t("")], spacing: { after: 120 } }),
  ];
}

function addressTable(r) {
  const left = [
    p([t(DATE)]),
    p([t(r.Campground_Name)], { spacing: { after: 0, line: 276 } }),
    p([t(r.Address)], { spacing: { after: 0, line: 276 } }),
    p([t(`${r.City}, ${r.State} ${r.Zip}`)], { spacing: { after: 260, line: 276 } }),
  ];
  return new Table({
    columnWidths: [6600, 2760], width: { size: 9360, type: WidthType.DXA },
    borders: { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB },
    rows: [new TableRow({ children: [
      new TableCell({ width: { size: 6600, type: WidthType.DXA }, borders: CELL, children: left }),
      new TableCell({ width: { size: 2760, type: WidthType.DXA }, borders: CELL, children: [
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new ImageRun({ type: "png", data: qr, transformation: { width: 82, height: 82 } })], spacing: { after: 10 } }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "fibernorth.com/camp", font: "Georgia", size: 16, color: "666666" })], spacing: { after: 0 } }),
      ] }),
    ] })],
  });
}

const lead = (text) => new Paragraph({ children: [t(text, { bold: true })], spacing: { before: 120, after: 90, line: 264 } });
const bullet = (text) => new Paragraph({ children: [t(text)], numbering: { reference: "b", level: 0 }, spacing: { after: 60, line: 252 } });
function sigRun() {
  const w = signature.readUInt32BE(16), h = signature.readUInt32BE(20), tw = 175;
  return new ImageRun({ type: "png", data: signature, transformation: { width: tw, height: Math.round((h / w) * tw) } });
}

function letterSection(r) {
  return {
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1440, right: 1440 } } },
    children: [
      ...letterhead(), addressTable(r),
      p([t(`Dear ${r.Owner_First},`)], { spacing: { after: 120, line: 264 } }),
      p([t("Bill Gaylord again, from FiberNorth Underground in Williamsburg. Last letter I said your WiFi trouble is usually in the ground, not on the poles. Here is the plain version.")], { spacing: { after: 90, line: 264 } }),
      lead("The WiFi boxes on your poles get their internet from a wireless link back to the office."),
      bullet("That link can only carry so much. On a full weekend it fills up and everybody slows down."),
      bullet("Trees, rain, and a packed park all make it worse."),
      bullet("The box on the pole can be brand new and guests still buffer. The problem is what feeds it."),
      lead("The fix is a fiber line out to each pole."),
      bullet("We put the line underground with a drill. No trench, no torn-up sites."),
      bullet("Your WiFi company hangs the same boxes on it. Nothing changes for them or for you."),
      bullet("Fiber does not slow down for weather, trees, or a full park."),
      lead("I know this because I did it the hard way."),
      bullet("I started an internet company here in Northern Michigan and ran it twenty years. Dial-up, then wireless, then fiber."),
      bullet("Every wireless link I ever put up needed fiber behind it in the end. Yours will too."),
      bullet("I live in Williamsburg. When you call, you get me, not a call center."),
      lead("The free walk still stands."),
      bullet("Walk the park with me and show me the bad spots. If the problem is not something we fix, I will tell you that too."),
      bullet("Not the owner? Same offer. I will put what I find on one page so you can hand it to them."),
      bullet("Work happens in your off season. Let's walk it before the snow."),
      p([t("Thanks for your time,")], { spacing: { before: 100, after: 60 } }),
      new Paragraph({ children: [sigRun()], spacing: { after: 40 } }),
      p([t("Bill Gaylord", { bold: true })], { spacing: { after: 0, line: 264 } }),
      p([t("Owner, FiberNorth Underground")], { spacing: { after: 0, line: 264 } }),
      p([t("Cell: (231) 944-6471 · Office: (231) 264-0757")], { spacing: { after: 0, line: 264 } }),
      p([t("bill@fibernorth.net · fibernorth.com/camp")], { spacing: { after: 0, line: 264 } }),
    ],
  };
}

const doc = new Document({
  styles: { default: { document: { run: BODY } } },
  numbering: { config: [{ reference: "b", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 200 } } } }] }] },
  sections: recipients.map(letterSection),
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(HERE, "FiberNorth-Campground-Letter-2-PRINT-READY.docx");
  fs.writeFileSync(out, buf);
  console.log("written", recipients.length, "letters ->", out);
});
