#!/usr/bin/env node
/**
 * Campground letter #2 of the 6-letter series.
 *
 * Continues letter #1's thread: the WiFi problem is the wireless backhaul
 * feeding the access points, and the fix is fiber to the poles. One new idea
 * per letter — this one is "what the upgrade actually looks like."
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
      p([t("Bill Gaylord again, FiberNorth Underground in Williamsburg. Last time I said your WiFi problem is usually underground, not on the poles. Here is what I mean, and what the fix looks like.")], { spacing: { after: 90, line: 264 } }),
      lead("Your access points are only as good as what feeds them."),
      bullet("Most parks feed their WiFi radios over a wireless link from the office. That link has a hard ceiling on bandwidth."),
      bullet("Trees, weather, and a full park all push on that ceiling. Saturday night it hits the wall."),
      bullet("The radio at the site can be perfect and the guest still buffers. The problem is behind it, not in front of it."),
      lead("Fiber to the poles takes the ceiling off."),
      bullet("We bore fiber out to your poles and buildings, under the sites, no trenching. Your WiFi company hangs the same radios on a fiber feed."),
      bullet("Fiber does not care about weather, trees, or how many rigs pulled in. The bandwidth you buy is the bandwidth that reaches the loop."),
      bullet("This is why the cell companies ran fiber to their towers. Same problem, same fix."),
      lead("I ran wireless networks for twenty years. That is how I know where they break."),
      bullet("I built a Northern Michigan internet company from dial-up, into wireless, and now into fiber."),
      bullet("Every wireless backhaul I ever put up eventually needed fiber behind it. Yours will too."),
      lead("The offer stands. A free walk of your park this fall."),
      bullet("You show me the loops guests gripe about. I'll tell you if it's the feed or the radio."),
      bullet("A few plans at different price points. You keep your WiFi company. We make their job easier."),
      bullet("Work happens in your off season. Your season stays untouched. Let's walk it before the snow flies."),
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
