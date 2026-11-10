#!/usr/bin/env node
/**
 * Contractor letter #3: the winter letter.
 *
 * Stands on its own. Theme: frozen ground parks the trencher, not the drill;
 * we bore all winter when trenching often isn't possible (Bill wants winter
 * work, no spring rush). Introduces Maddy Herman (sales and estimating).
 * Facts per Bill, Nov 2026: typical bore up to 150 ft about $3,000 with the
 * ground/size/pit disclaimer; usually bored within a week of the go-ahead;
 * pullback up to 6 inches; no restoration promise. Easiest ask: text a
 * photo of the print.
 *
 * Regenerate from the repo root:
 *   node marketing/contractors/merge-print-contractors-3.js [recipients.json]
 * Default recipients: marketing/contractors/recipients-letter-3.json (203: the core list with addresses checked Nov 10, minus 2 businesses that could not be confirmed).
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
const DATE = process.env.LETTER_DATE || "November 16, 2026";
// Maddy fills in her number: every letter shows the placeholder highlighted,
// so one Find & Replace in Word or Google Docs sets all of them. Or set
// MADDY_PHONE="(231) 555-0000" when regenerating.
const MADDY_PHONE = process.env.MADDY_PHONE || "[MADDY'S NUMBER]";
const MADDY_PHONE_STYLE = process.env.MADDY_PHONE ? {} : { highlight: "yellow", bold: true };

const src = process.argv[2] ? path.resolve(process.argv[2]) : path.join(HERE, "recipients-letter-3.json");
const outName = process.argv[3] || "FiberNorth-Contractor-Letter-3-PRINT-READY.docx";

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
      p([t(`Dear ${r.Company_Name},`)], { spacing: { after: 160, line: 276 } }),
      p([t("When the ground freezes, the trencher gets parked. So what happens to the jobs that still need a line in the ground?")], { spacing: { after: 150, line: 270 } }),
      p([t("That's when a drill earns its keep. We bore under the frost all winter, when trenching often isn't possible. The power run to a new shop, the gas line to a generator, the water line from a well don't have to sit until the ground thaws. No frozen spoil to fight, no trench to backfill in January.")], { spacing: { after: 150, line: 270 } }),
      p([t("A typical shot up to 150 feet in normal ground with a standard line runs about $3,000 and is usually done in a day. Rock or cobble, bigger pipe, or a pit that's hard to dig costs more, and we'll tell you before we start. Five Vermeer drills with pullback up to 6 inches, our own hydrovac, and a locator on staff who finds the private lines MISS DIG won't mark.")], { spacing: { after: 150, line: 270 } }),
      p([t("Two ways to work it. Sub the bore to us, mark it up, and keep the customer. Or hand it over and we'll pay you 10 percent of the drilling. Either way the customer stays yours.")], { spacing: { after: 150, line: 270 } }),
      p([t("I'd also like you to meet Maddy Herman, who handles sales and estimating for us. Maddy can price a bore, set up a site walk, and get you on the winter schedule. Reach her at "), t(MADDY_PHONE, MADDY_PHONE_STYLE), t(" or maddy@fibernorth.com. You can still text a photo of the print to my cell at (231) 944-6471 and one of us will get you a number you can build on.")], { spacing: { after: 150, line: 270 } }),
      p([t("Thanks for your time,")], { spacing: { before: 60, after: 60 } }),
      new Paragraph({ children: [sigRun()], spacing: { after: 40 } }),
      p([t("Bill Gaylord", { bold: true })], { spacing: { after: 0, line: 264 } }),
      p([t("Owner, FiberNorth Underground")], { spacing: { after: 0, line: 264 } }),
      p([t("Cell (231) 944-6471 · fibernorth.com")], { spacing: { after: 200, line: 264 } }),
      p([t("P.S. Winter is when our schedule has room. If you've got a bore you've been putting off until spring, call Maddy now and it can be in before the snow's gone.")], { spacing: { after: 0, line: 264 } }),
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
