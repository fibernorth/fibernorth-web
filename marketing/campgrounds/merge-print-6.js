#!/usr/bin/env node
/**
 * Campground letter #6 (last of the series): one offer and proof from a park
 * we've done. Proof is the KOA expansion and the resort WiFi fiber, exactly
 * as /campgrounds states them (no names). The offer is the free park walk
 * with one page of prices per line; winter work, no spring rush. The $3,000
 * figure carries the ground and line-size disclaimer; no restoration promise
 * (owner, Nov 2026). Same layout as letters 3 to 5.
 *
 * Regenerate from the repo root:  node marketing/campgrounds/merge-print-6.js
 * LETTER_DATE="November 20, 2026" overrides the date.
 * Reads marketing/campgrounds/recipients.json (100); one letter per page.
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
const DATE = process.env.LETTER_DATE || "November 20, 2026";

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
      p([t(`Dear ${r.Owner_First},`)], { spacing: { after: 160, line: 276 } }),
      p([t("This is Bill Gaylord with FiberNorth Underground in Williamsburg. This is the last letter I'll send you this year, so I'll keep it to one offer.")], { spacing: { after: 160, line: 276 } }),
      p([t("First, why you can trust us in your park. Last year we built the underground for a KOA campground's new expansion, working right alongside the company putting in their WiFi. Before that, we built the fiber that feeds WiFi across the condo buildings of a large Grand Traverse area resort. A campground is the same work on a smaller map.")], { spacing: { after: 160, line: 276 } }),
      lead("The offer: a free walk of your park, and one page of prices."),
      p([t("I'll walk the park with you and look at what campers complain about: the WiFi at the back loop, power at the far sites, the water line that leaks every spring. Then I'll leave you one page with a price for each line. You pick what gets done this winter and what can wait. If there's nothing worth fixing, I'll tell you that too.")], { spacing: { after: 160, line: 276 } }),
      p([t("We drill all winter. Frozen ground doesn't stop the drill, and with the park empty nobody is driving around our pits. Book it now and the work is done before your first camper pulls in, not stuck in the spring line.")], { spacing: { after: 160, line: 276 } }),
      p([t("For a feel for cost: a typical bore up to 150 feet runs about $3,000 for the drilling and pulling the line through, in normal ground with a standard-size line. Rock, bigger pipe and hard-to-dig pits cost more, and the walk is where we find that out.")], { spacing: { after: 160, line: 276 } }),
      p([t("If you run the park for somebody else, hand them this page.")], { spacing: { after: 160, line: 276 } }),
      p([t("Call or text me at (231) 944-6471, or scan the code at the top and send me a note. I'll set up a time to come out.")], { spacing: { after: 160, line: 276 } }),
      p([t("Thanks,")], { spacing: { before: 100, after: 60 } }),
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
  const out = path.join(HERE, "FiberNorth-Campground-Letter-6-PRINT-READY.docx");
  fs.writeFileSync(out, buf);
  console.log("written", recipients.length, "letters ->", out);
});
