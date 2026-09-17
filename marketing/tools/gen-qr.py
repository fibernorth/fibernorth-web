#!/usr/bin/env python3
"""Regenerate the campaign QR codes (camp, pros, vCard).

Outputs SVGs with a white quiet zone so they scan on any background.
Run from the repo root:  python marketing/tools/gen-qr.py
Requires: pip install qrcode
"""
import qrcode, qrcode.constants as C, os

OUT = os.path.join(os.path.dirname(__file__), "..", "assets")
os.makedirs(OUT, exist_ok=True)

VCARD = "\r\n".join([
    "BEGIN:VCARD", "VERSION:3.0",
    "N:Gaylord - Boring Contractor;Bill;;;",
    "FN:Bill Gaylord", "ORG:FiberNorth Underground", "TITLE:Owner",
    "TEL;TYPE=CELL:+12319446471", "TEL;TYPE=WORK:+12312640757",
    "EMAIL:bill@fibernorth.net", "URL:https://fibernorth.com",
    "END:VCARD", "",
])

TARGETS = {
    "qr-camp": "https://fibernorth.com/camp",
    "qr-pros": "https://fibernorth.com/pros",
    "qr-vcard": VCARD,
}

def render(name, data):
    q = qrcode.QRCode(error_correction=C.ERROR_CORRECT_M, border=2)
    q.add_data(data); q.make(fit=True)
    m = q.get_matrix(); n = len(m); cell = 10; size = n * cell
    rects = "".join(
        f'<rect x="{x*cell}" y="{y*cell}" width="{cell}" height="{cell}"/>'
        for y, row in enumerate(m) for x, v in enumerate(row) if v
    )
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" '
           f'viewBox="0 0 {size} {size}" shape-rendering="crispEdges">'
           f'<rect width="{size}" height="{size}" fill="#FFFFFF"/>'
           f'<g fill="#0C1017">{rects}</g></svg>')
    with open(os.path.join(OUT, name + ".svg"), "w") as f:
        f.write(svg)
    print(f"{name}: {n} modules")

if __name__ == "__main__":
    for name, data in TARGETS.items():
        render(name, data)
