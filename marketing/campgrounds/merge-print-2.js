#!/usr/bin/env node
/**
 * Campground letter #2 of the 6-letter series — the reviews hook + Bill's
 * 20-year story (dialup -> wireless -> fiber) + localness.
 *
 * Regenerate the print-ready file from the repo root:
 *   node marketing/campgrounds/merge-print-2.js
 *
 * Reads marketing/campgrounds/recipients.json (Owner_First, Campground_Name,
 * Address, City, State, Zip) and writes a one-letter-per-page .docx.
 * Requires the `docx` npm package and the campaign QR + signature PNGs
 * (regenerate those with the tools/ scripts). Assets are resolved relative to
 * this file so it runs from anywhere.
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
const qr = fs.readFileSync(path.join(ASSETS, "qr-camp.png"));         // from tools/gen-qr (rasterized)
const signature = fs.readFileSync(path.join(ASSETS, "signature-hand.png")); // from tools/gen-signature
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
      p([t("Bill Gaylord again, FiberNorth Underground, right here in Williamsburg. One idea this time, and it is the one that quietly costs a park bookings.")], { spacing: { after: 90, line: 264 } }),
      lead("Your guests grade your WiFi in public."),
      bullet("Read your own reviews. \"Great park, WiFi was useless\" turns up at campgrounds all over the north."),
      bullet("That line is sitting there when the next family goes to book."),
      bullet("To a camper, a dead connection on a Saturday night knocks a star off your rating."),
      lead("I have spent 20 years watching this problem change, and I am local."),
      bullet("I built a Northern Michigan internet company from the dial-up days, into wireless, and now into fiber."),
      bullet("Same fight the whole way. Never really the signal. Always the bandwidth behind it."),
      bullet("I know these parks and the ground they sit on. This is home."),
      lead("More antennas will not fix a review. More bandwidth will."),
      bullet("If it crawls when the park fills up, the pipe feeding your access points is too small."),
      bullet("We bore fiber out to your poles and buildings without tearing up the sites. Your WiFi company hangs the gear."),
      bullet("Underground, in your off season. Guests never see the work."),
      lead("Same offer as my last letter. A free walk this fall."),
      bullet("Walk me to the loops people gripe about. I will tell you what I see."),
      bullet("A few plans at different price points. No cost for the look."),
      bullet("If your setup is fine, or it is a quick fix for your WiFi guy, I will say so."),
      p([t("The busy season fills up over the winter. The work that fixes the WiFi happens then too. Let's walk the park before the snow flies.")], { spacing: { before: 120, after: 90, line: 264 } }),
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
