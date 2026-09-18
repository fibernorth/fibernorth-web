#!/usr/bin/env python3
"""Handwritten-look #10 envelopes for a recipient list.

Renders each delivery address in Homemade Apple (blue ink, per-character
jitter so it doesn't look like a font) with Pillow, then builds a .docx with
one #10 envelope (9.5 x 4.125 in, landscape) per page via the `docx` npm
package.  Return address is printed in the top-left.

Run from the repo root:
  python marketing/tools/gen-envelopes.py marketing/campgrounds/recipients.json \
      marketing/campgrounds/FiberNorth-Campground-Envelopes.docx
Requires: pip install pillow ; npm install --no-save docx
"""
import json, os, random, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, "..", "assets", "HomemadeApple.ttf")
INK = (24, 54, 140)

src = sys.argv[1]
out = sys.argv[2]
recipients = json.load(open(src))
random.seed(7)

def handwrite(lines, size=58, w=1500):
    font = ImageFont.truetype(FONT, size)
    lh = int(size * 1.55)
    img = Image.new("RGBA", (w, lh * len(lines) + 40), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    y = 10
    for line in lines:
        x = 10 + random.randint(0, 18)
        for ch in line:
            cw = d.textlength(ch, font=font)
            dy = random.randint(-3, 3)
            d.text((x, y + dy), ch, font=font, fill=INK)
            x += cw + random.uniform(-1.0, 1.5)
        y += lh + random.randint(-2, 2)
    bbox = img.getbbox()
    return img.crop((0, 0, min(w, bbox[2] + 20), bbox[3] + 10))

tmp = tempfile.mkdtemp()
manifest = []
for i, r in enumerate(recipients):
    lines = [r["Campground_Name"], r["Address"], f'{r["City"]}, {r["State"]}  {r["Zip"]}']
    if r.get("Owner_Name"):
        lines.insert(0, f'Attn: {r["Owner_Name"]}')
    img = handwrite(lines)
    p = os.path.join(tmp, f"a{i}.png")
    img.save(p)
    manifest.append({"png": p, "w": img.width, "h": img.height})
json.dump(manifest, open(os.path.join(tmp, "m.json"), "w"))

js = r'''
const fs=require("fs"),{Document,Packer,Paragraph,TextRun,ImageRun,AlignmentType}=require("docx");
const m=JSON.parse(fs.readFileSync(process.argv[2]));
const logo=fs.readFileSync("public/logo/fibernorth-logo-light.png");
const sections=m.map(a=>{
  const scale=4.6/(a.w/300); // fit in ~4.6in width at 300dpi equivalent
  const tw=Math.min(a.w/3.2, 330), th=Math.round(a.h*(tw/a.w));
  return {properties:{page:{size:{width:13680,height:5940,orientation:"landscape"},margin:{top:500,bottom:400,left:600,right:600}}},
   children:[
    new Paragraph({children:[new ImageRun({type:"png",data:logo,transformation:{width:120,height:45}})],spacing:{after:40}}),
    new Paragraph({children:[new TextRun({text:"6227 Arnold Rd",font:"Georgia",size:18})],spacing:{after:0}}),
    new Paragraph({children:[new TextRun({text:"Williamsburg, MI 49690",font:"Georgia",size:18})],spacing:{after:0}}),
    new Paragraph({children:[new TextRun({text:""})],spacing:{before:600,after:0}}),
    new Paragraph({indent:{left:5200},children:[new ImageRun({type:"png",data:fs.readFileSync(a.png),transformation:{width:tw,height:th}})]}),
  ]};
});
Packer.toBuffer(new Document({sections})).then(b=>{fs.writeFileSync(process.argv[3],b);console.log("written",m.length,"envelopes ->",process.argv[3]);});
'''
repo = os.path.abspath(os.path.join(HERE, "..", ".."))
jsp = os.path.join(repo, ".envelope-build.tmp.js")  # inside repo so node finds node_modules/docx
open(jsp, "w").write(js)
try:
    subprocess.run(["node", jsp, os.path.join(tmp, "m.json"), os.path.abspath(out)], cwd=repo, check=True)
finally:
    os.remove(jsp)

# Post-process: the docx package writes the envelope as a 4.125 x 9.5 portrait
# page with a landscape flag, and no paper-size code. Rewrite every section to a
# true 9.5 x 4.125 landscape page tagged as Envelope #10 (paper code 20) so Word
# and the printer driver pick the envelope size and feed automatically.
import re, shutil, zipfile
PGSZ = '<w:pgSz w:w="13680" w:h="5940" w:orient="landscape" w:code="20"/>'
fixed = out + ".tmp"
with zipfile.ZipFile(out) as zin, zipfile.ZipFile(fixed, "w", zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename == "word/document.xml":
            xml = data.decode("utf-8")
            xml, n = re.subn(r"<w:pgSz[^>]*/>", PGSZ, xml)
            print("page setup -> Envelope #10 on", n, "sections")
            data = xml.encode("utf-8")
        zout.writestr(item, data)
shutil.move(fixed, out)
