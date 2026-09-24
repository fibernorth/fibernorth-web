#!/usr/bin/env node
/**
 * Contractor letter #2: the winter letter.
 *
 * Stands fully on its own, no reference to any earlier letter. Theme: we
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
      p([t("Dear Owner,")], { spacing: { after: 120, line: 264 } }),
      p([t("Bill Gaylord, FiberNorth Underground, Williamsburg. We run a directional drill rig and a locating crew, and we would rather be the sub you call than the guy you never heard of. Quick pitch, then I will leave you alone.")], { spacing: { after: 90, line: 264 } }),
      lead("Frost is our season."),
      bullet("Once the ground locks up, an open cut turns into a fight. We keep drilling right through to spring. If a job stalls on you in January because a line has to cross a driveway or a road, that is a phone call, not a spring project."),
      bullet("Most shots are in and out the same day. Your crew keeps moving."),
      lead("Two ways to get paid on it."),
      bullet("Sub it. We hand you a number, you mark it up and stay the face of the job. We never talk to your customer unless you want us to."),
      bullet("Refer it. Not your job, not your headache. Send it over and take 10% of the drilling. No paperwork."),
      lead("What we run."),
      bullet("Water, power, gas, sewer, drainage, conduit, fiber. Under driveways, roads, lawns, septic fields, tree lines, whatever you would rather not open up."),
      bullet("Entries through a block wall, into a crawl space or a basement, so the line lands where the tie-in actually is."),
      lead("We locate before we drill."),
      bullet("MISS DIG stops at the meter. Our own crew finds and maps the private lines first, so nothing of yours or your customer's gets hit."),
      bullet("About 50 miles around Traverse City."),
      p([t("Next bid that needs a line under something, call my cell. You will have a price the same day, and it will be a number you can build on.")], { spacing: { before: 100, after: 100, line: 264 } }),
      p([t("Thanks for your time,")], { spacing: { before: 60, after: 60 } }),
      new Paragraph({ children: [sigRun()], spacing: { after: 40 } }),
      p([t("Bill Gaylord", { bold: true })], { spacing: { after: 0, line: 264 } }),
      p([t("Owner, FiberNorth Underground")], { spacing: { after: 0, line: 264 } }),
      p([t("Cell: (231) 944-6471 · Office: (231) 264-0757")], { spacing: { after: 0, line: 264 } }),
      p([t("bill@fibernorth.net · fibernorth.com/pros")], { spacing: { after: 0, line: 264 } }),
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
