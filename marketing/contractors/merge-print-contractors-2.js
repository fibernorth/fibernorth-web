#!/usr/bin/env node
/**
 * Contractor letter #2: the winter letter.
 *
 * Stands fully on its own, no reference to any earlier letter. Theme: no
 * disturbance to driveways, lawns, landscaping, trees (Bill cut the winter angle). Was: we
 * drill through the winter, so the sub/refer offer is worth more from now
 * to March than it was in September. Plain voice, "directional drilling"
 * not "boring".
 *
 * Regenerate from the repo root:
 *   node marketing/contractors/merge-print-contractors-2.js [recipients.json]
 * Default recipients: marketing/contractors/recipients-contractors.json
 * (the 94 who got letter 1). Writes one letter per page.
 * Needs the `docx` package plus assets/qr-pros.png and assets/signature-hand.png.
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
const DATE = "October 2, 2026";

const src = process.argv[2] ? path.resolve(process.argv[2]) : path.join(HERE, "recipients-contractors.json");
const outName = process.argv[3] || "FiberNorth-Contractor-Letter-2-PRINT-READY.docx";

const logo = fs.readFileSync(path.join(REPO, "public/logo/fibernorth-logo-light.png"));
const qr = fs.readFileSync(path.join(ASSETS, "qr-pros.png"));
const signature = fs.readFileSync(path.join(ASSETS, "signature-hand.png"));
const recipients = JSON.parse(fs.readFileSync(src, "utf8"));

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
    p([t(r.Company_Name)], { spacing: { after: 0, line: 276 } }),
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
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "fibernorth.com/pros", font: "Georgia", size: 16, color: "666666" })], spacing: { after: 0 } }),
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
      p([t("Dear Owner,")], { spacing: { after: 160, line: 276 } }),
      p([t("How many times has a customer asked you to run a line out to the new garage without touching the driveway they just paid for? Or past the maples their grandfather planted?")], { spacing: { after: 160, line: 276 } }),
      p([t("That's the part of the job we're set up for. We drill under whatever's in the way and pull the line back through. Two small pits and that's it. The blacktop, the lawn, the landscaping and the trees look the same when we pull out as when we pulled in.")], { spacing: { after: 160, line: 276 } }),
      p([t("Water, power, gas, sewer, drain tile, conduit, fiber. We can come up in a basement or a crawl space, or bring it through a block wall right at the tie-in. Five drills with pullback up to 10 inches, our own hydrovac for exposing crossings, and locators on staff who find the private lines MISS DIG won't mark before the head ever goes in the ground.")], { spacing: { after: 160, line: 276 } }),
      p([t("You can handle it two ways. Sub the bore to us, mark it up, and keep the customer. Or if you'd rather not mess with it, hand it over and we'll pay you 10 percent of the drilling. Either way the customer stays yours.")], { spacing: { after: 160, line: 276 } }),
      p([t("Next time a bid has a driveway, a yard, or a tree line in the way, call my cell before you price it: (231) 944-6471. I'll give you a number you can build on.")], { spacing: { after: 160, line: 276 } }),
      p([t("Thanks for your time,")], { spacing: { before: 60, after: 60 } }),
      new Paragraph({ children: [sigRun()], spacing: { after: 40 } }),
      p([t("Bill Gaylord", { bold: true })], { spacing: { after: 0, line: 264 } }),
      p([t("Owner, FiberNorth Underground")], { spacing: { after: 0, line: 264 } }),
      p([t("Cell (231) 944-6471 · fibernorth.com")], { spacing: { after: 200, line: 264 } }),
      p([t("P.S. Most residential shots are done in a day, and we can drill all winter. If you need to trench in frost, we can help with that by just drilling it under the frost, saving a bunch of time running your line.")], { spacing: { after: 0, line: 264 } }),
    ],
  };
}

const doc = new Document({
  styles: { default: { document: { run: BODY } } },
  numbering: { config: [{ reference: "b", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 200 } } } }] }] },
  sections: recipients.map(letterSection),
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(HERE, outName);
  fs.writeFileSync(out, buf);
  console.log("written", recipients.length, "letters ->", out);
});
