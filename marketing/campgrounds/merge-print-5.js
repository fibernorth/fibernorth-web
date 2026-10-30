#!/usr/bin/env node
/**
 * Campground letter #5: how the work happens, and why the park isn't torn up.
 * Walks an owner through a day: finding the lines (MISS DIG, private lines,
 * hydrovac), two small pits, the drill steering under sites and trees, the
 * pullback, filling the pits, sites open that night. Plain paragraphs in
 * Bill's voice; stands alone. Same layout as letters 3 and 4.
 *
 * Regenerate from the repo root:  node marketing/campgrounds/merge-print-5.js
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
const DATE = "November 2, 2026";

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
      p([t("This is Bill Gaylord with FiberNorth Underground in Williamsburg. Park owners ask me the same thing before we start. What is my park going to look like while you're here? Here's how a day goes.")], { spacing: { after: 160, line: 276 } }),
      p([t("Before we drill, we find what's already in the ground. MISS DIG marks the public lines, and we walk your private ones with you: water, sewer, and the electric out to the pedestals. Where one of them crosses our path, our hydrovac opens a small hole with water and air so we can see the line instead of guessing.")], { spacing: { after: 160, line: 276 } }),
      p([t("Then we dig two small pits, one where the new line starts and one where it ends. The drill sits at one end and steers a head under the sites, the road and the tree roots. We track it from the top the whole way and hold it at the depth we planned.")], { spacing: { after: 160, line: 276 } }),
      p([t("When the head comes up in the far pit, we hook on the new pipe or conduit and pull it back through. If you want a spare conduit for later, it can ride along in the same bore.")], { spacing: { after: 160, line: 276 } }),
      p([t("Then we fill the pits and bring them back to grade. No trench across your sites, no dirt pile in the road, no ruts through the grass. Most rows are done in a day, and campers can be on those sites that night.")], { spacing: { after: 160, line: 276 } }),
      p([t("If you run the park for somebody else, that's the part to show them. The work fits between weekends, and the park looks the same when we leave.")], { spacing: { after: 160, line: 276 } }),
      p([t("The ground freezes soon. Call or text me at (231) 944-6471 and I'll come walk the park with you while there's still time to plan the work.")], { spacing: { after: 160, line: 276 } }),
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
  const out = path.join(HERE, "FiberNorth-Campground-Letter-5-PRINT-READY.docx");
  fs.writeFileSync(out, buf);
  console.log("written", recipients.length, "letters ->", out);
});
