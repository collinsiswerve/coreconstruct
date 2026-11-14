"""Build the fictional M6 drawing sets, concept thumbnails and procurement records."""

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, A3, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import simpleSplit


ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "preview" / "public" / "samples" / "portfolio"
BLUE = colors.HexColor("#214c55")
GREEN = colors.HexColor("#25755d")
PAPER = colors.HexColor("#eff5f2")
LIGHT = colors.HexColor("#c5d6d5")
IRON = colors.HexColor("#5a7075")
AMBER = colors.HexColor("#a2642d")
REGULAR = "PortfolioSans"
BOLD = "PortfolioSansBold"
FONT_ROOT = Path("/usr/share/fonts/truetype/liberation")


def text(c, x, y, value, size=10, bold=False, tone=BLUE):
    c.setFillColor(tone)
    c.setFont(BOLD if bold else REGULAR, size)
    c.drawString(x, y, str(value))


def lines(c, x, y, message, width, size=10, gap=14, tone=BLUE):
    for line in simpleSplit(message, REGULAR, size, width):
        text(c, x, y, line, size, tone=tone)
        y -= gap
    return y


def make_pdf(path, project, code, title, size=landscape(A3), revision=1):
    c = canvas.Canvas(str(path), pagesize=size, invariant=1, pageCompression=1)
    c.setTitle(f"{project['code']} {code} {title}")
    c.setAuthor("Archi-Hub Studio fictional portfolio")
    w, h = size
    c.setStrokeColor(LIGHT)
    c.setLineWidth(0.7)
    c.rect(27, 27, w - 54, h - 54)
    c.line(27, h - 104, w - 27, h - 104)
    c.line(27, 75, w - 27, 75)
    text(c, 43, h - 54, "ARCHI-HUB STUDIO", 11, True, GREEN)
    text(c, 43, h - 82, project["name"], 22, True)
    text(c, w - 344, h - 54, code + f"   /   REV {revision}", 13, True)
    text(c, w - 344, h - 79, title, 12, True)
    text(c, 43, 54, "FICTIONAL SAMPLE  /  DEMONSTRATION ONLY", 9, True, AMBER)
    text(c, 43, 39, "Illustrative project information. Do not use for construction, pricing or certification.", 9, tone=IRON)
    text(c, w - 358, 52, project["code"] + "   |   " + project["town"] + ", " + project["county"], 10, True)
    text(c, w - 358, 39, "Sample record date   " + project["snapshot"], 9, tone=IRON)
    return c, w, h


def finish(c):
    c.showPage()
    c.save()


def box(c, x, y, w, h, fill=PAPER, stroke=BLUE, width=0.9):
    c.setStrokeColor(stroke)
    c.setFillColor(fill)
    c.setLineWidth(width)
    c.rect(x, y, w, h, stroke=1, fill=1)


def line(c, x1, y1, x2, y2, tone=BLUE, width=0.8):
    c.setStrokeColor(tone)
    c.setLineWidth(width)
    c.line(x1, y1, x2, y2)


def dimension(c, x, y, length, value, vertical=False):
    if vertical:
        line(c, x, y, x, y + length, IRON, 0.6)
        for yy in (y, y + length):
            line(c, x - 4, yy - 4, x + 4, yy + 4, IRON)
        c.saveState()
        c.translate(x - 8, y + length / 2)
        c.rotate(90)
        text(c, -24, 0, value, 10, True)
        c.restoreState()
    else:
        line(c, x, y, x + length, y, IRON, 0.6)
        for xx in (x, x + length):
            line(c, xx - 4, y - 4, xx + 4, y + 4, IRON)
        text(c, x + length / 2 - 23, y + 7, value, 10, True)


def side_notes(c, project, sections):
    x = 860
    text(c, x, 672, "PROJECT COORDINATION", 12, True, GREEN)
    y = 644
    for label, message in sections:
        text(c, x, y, label, 10, True)
        y = lines(c, x, y - 17, message, 280, size=10) - 19
    text(c, x, y, "Drawing status", 10, True)
    lines(c, x, y - 17, "Illustrative scope and geometry for app testing. Dimensions represent assumed sample extents.", 280)


def plan_geometry(p):
    width, depth = min(585, p["width"] * 14), min(448, p["depth"] * 14)
    scale = min(width / p["width"], depth / p["depth"])
    width = p["width"] * scale
    depth = p["depth"] * scale
    return 134, 394 - depth / 2, width, depth


def plan(project, revision):
    p = project
    c, _, _ = make_pdf(DEST / p["id"] / f"A101-R{revision}.pdf", p, "A-101", "Ground floor plan", revision=revision)
    x, y, w, h = plan_geometry(p)
    gap = w * (0.35 if p["shape"] == "courtyard" else 0.10)
    col = (w - gap) / 2
    row = h / 3
    box(c, x, y, w, h, colors.white, BLUE, 2.5)
    for idx, room in enumerate(p["rooms"]):
        right = idx >= 3
        rx = x + col + gap if right else x
        ry = y + (idx % 3) * row
        box(c, rx + 3, ry + 3, col - 6, row - 6, PAPER, BLUE, 1.1)
        text(c, rx + 10, ry + row - 20, f"{idx + 1:02}  {room}", 9.5, True)
        line(c, rx + 14, ry + 8, rx + col - 14, ry + 8, GREEN, 1.8)
        dx = rx + 3 if right else rx + col - 3
        line(c, dx, ry + row * .28, dx, ry + row * .28 + 16, colors.white, 2.8)
        line(c, dx, ry + row * .28, dx + (11 if right else -11), ry + row * .28 + 12, AMBER, 0.8)
    mid = x + w / 2
    c.setStrokeColor(GREEN)
    c.setDash(5, 4)
    c.line(mid, y + 6, mid, y + h - 9)
    c.setDash()
    text(c, mid - 20, y + h + 12, "ENTRY", 9, True)
    line(c, mid, y + h + 39, mid, y + h + 24, GREEN, 1.2)
    line(c, mid, y + h + 24, mid - 5, y + h + 29, GREEN)
    line(c, mid, y + h + 24, mid + 5, y + h + 29, GREEN)
    if p["shape"] == "courtyard":
        text(c, x + col + 9, y + row * 1.55, "Shared court", 10, True, GREEN)
    if revision == 2:
        line(c, x + 4, y - 18, mid, y - 18, AMBER, 1.6)
        line(c, mid, y - 18, mid, y - 1, AMBER, 1.6)
        text(c, x + 5, y - 34, "REV 02   Step-free entrance route and door clearances reviewed", 9, True, AMBER)
    dimension(c, x, y - 53, w, f"{p['width'] * 1000:,}")
    dimension(c, x - 35, y, h, f"{p['depth'] * 1000:,}", True)
    side_notes(c, p, [
        ("Client brief", p["brief"]),
        ("Space schedule", ", ".join(p["rooms"]) + "."),
        ("Drawing reference", "A-202 elevations and section. S-101 structural grids. M-101 service routes."),
        ("Revision scope", "Revised entry and circulation route." if revision == 2 else "Initial issue for project coordination."),
    ])
    finish(c)


def elevation(p):
    c, _, _ = make_pdf(DEST / p["id"] / "A202-R1.pdf", p, "A-202", "Elevation and building section")
    x, y, w, h = 132, 475, 575, min(191, 54 + 26 * p["storeys"])
    bay = w / 6
    level = h / p["storeys"]
    box(c, x, y, w, h, PAPER, BLUE, 1.9)
    for index in range(p["storeys"]):
        for i in range(6):
            box(c, x + i * bay + 13, y + index * level + 10, bay - 25, level - 19,
                colors.HexColor("#cbdfdf"), BLUE, 0.65)
        line(c, x - 4, y + index * level, x + w + 4, y + index * level, BLUE, 1.3)
    if p["storeys"] < 3:
        line(c, x - 5, y + h, x + w / 2, y + h + 27, BLUE, 1.8)
        line(c, x + w / 2, y + h + 27, x + w + 5, y + h, BLUE, 1.8)
    text(c, x, y - 25, "01   Principal elevation", 12, True)
    section_y = 185
    for i in range(p["storeys"] + 1):
        yy = section_y + i * (min(185, h) / p["storeys"])
        line(c, x, yy, x + w, yy, BLUE, 1.7)
        text(c, x + w + 10, yy - 3, f"{i * 3.2:+.2f} m", 8, tone=IRON)
    for i in range(4):
        xx = x + i * w / 3
        line(c, xx, section_y - 12, xx, section_y + min(185, h), BLUE, 1.5)
    if p["levels"]:
        box(c, x + 6, section_y - 42, w - 12, 38, PAPER, GREEN)
        text(c, x + 14, section_y - 27, "Basement parking", 9, True)
    text(c, x, section_y - 58, "02   Building section and sample levels", 12, True)
    side_notes(c, p, [
        ("Facade intent", p["render"] + "."),
        ("Levels", f"{p['storeys']} above ground. {p['levels']} basement level(s)."),
        ("Coordination", "Confirm openings, floor edges and drainage interfaces in the sample detail register."),
    ])
    finish(c)


def structural_grid(p):
    c, _, _ = make_pdf(DEST / p["id"] / "S101-R1.pdf", p, "S-101", "Foundation and structural grid")
    x, y, w, h = plan_geometry(p)
    box(c, x, y, w, h, colors.white, LIGHT)
    xs = [x + i * w / 4 for i in range(5)]
    ys = [y + j * h / 3 for j in range(4)]
    for i, xx in enumerate(xs):
        line(c, xx, y - 15, xx, y + h + 23, IRON, 0.5)
        text(c, xx - 4, y + h + 29, str(i + 1), 10, True)
    for j, yy in enumerate(ys):
        line(c, x - 16, yy, x + w + 16, yy, IRON, 0.5)
        text(c, x - 26, yy - 3, chr(65 + j), 10, True)
    for xx in xs:
        for yy in ys:
            box(c, xx - 11, yy - 11, 22, 22, PAPER, GREEN)
            box(c, xx - 3, yy - 3, 6, 6, GREEN, GREEN)
    dimension(c, x, y - 42, w, f"{p['width'] * 1000:,}")
    dimension(c, x - 49, y, h, f"{p['depth'] * 1000:,}", True)
    text(c, x, 110, "01   Concept grid and indicative footing locations", 12, True)
    side_notes(c, p, [
        ("Assumed structural system", p["structure"] + "."),
        ("Interfaces", "Coordinate ground levels, service sleeves and building movement joints at the sample review."),
        ("BOQ references", "S-01 to S-04 for substructure and ground works. S-05 and S-06 for the frame and slab."),
        ("Drawing reference", "S-201 contains typical section details and inspection hold points."),
    ])
    finish(c)


def structural_section(p):
    c, _, _ = make_pdf(DEST / p["id"] / "S201-R1.pdf", p, "S-201", "Frame section and typical details")
    for i, label in enumerate(("Base and erection interface", "Floor edge and wall interface", "Roof and rainwater interface")):
        x, y = 89 + i * 245, 363
        box(c, x, y, 213, 233, colors.white, LIGHT)
        cy = y + 86
        box(c, x + 36, cy - 11, 140, 20, PAPER, BLUE, 1.5)
        box(c, x + 96, cy + 9, 21, 90, colors.HexColor("#e1eae7"), BLUE, 1.4)
        for b in range(7):
            line(c, x + 52 + 15 * b, cy - 18, x + 65 + 15 * b, cy - 31, IRON, 0.45)
        line(c, x + 113, cy + 46, x + 168, cy + 65, GREEN)
        text(c, x + 134, cy + 72, "Review", 9, True, GREEN)
        text(c, x + 12, y + 206, str(i + 1).zfill(2) + "   " + label, 10, True)
    text(c, 91, 307, "Sample inspection sequence", 13, True, GREEN)
    y = 279
    for point in ("Confirm setting-out grids before starting foundation records.",
                  "Record base or starter locations before closing work.",
                  "Check openings and levels at the slab and services coordination review.",
                  "Record attachment evidence and the reviewer’s fictional decision in CoreConstruct."):
        y = lines(c, 91, y, point, 640) - 13
    side_notes(c, p, [
        ("Frame", p["structure"] + "."),
        ("Detail cross-check", "Use S-101 to find the concept grid. Use the measured structural BOQ to trace base, frame and slab items."),
        ("Review schedule", "Confirm sample tender-stage sequencing, current drawings and pending decisions with the project lead."),
    ])
    finish(c)


def services(p):
    c, _, _ = make_pdf(DEST / p["id"] / "M101-R1.pdf", p, "M-101", "Services coordination plan")
    x, y, w, h = plan_geometry(p)
    box(c, x, y, w, h, PAPER, BLUE, 1.7)
    for i in [1, 2, 3]:
        line(c, x + i * w / 4, y, x + i * w / 4, y + h, LIGHT)
    for i in [1, 2]:
        line(c, x, y + h * i / 3, x + w, y + h * i / 3, LIGHT)
    for index, color in enumerate((GREEN, AMBER, colors.HexColor("#436a9a"))):
        yy = y + h * (0.28 + index * .16)
        line(c, x + 22, yy, x + w - 24, yy, color, 2)
        for f in (.16, .44, .78):
            xx = x + w * f
            line(c, xx, yy, xx, yy + (20 if index != 2 else -27), color, 1.4)
            box(c, xx - 4, yy - 4, 8, 8, colors.white, color, 1.3)
    for i, (label, color) in enumerate((("Water and drainage", GREEN), ("Power and lighting", AMBER), ("Low-voltage and controls", colors.HexColor("#436a9a")))):
        line(c, 136, 142 - i * 16, 161, 142 - i * 16, color, 2)
        text(c, 170, 138 - i * 16, label, 9)
    side_notes(c, p, [
        ("Route intent", "Sample service corridors lead from the distribution zone to occupied areas. Coordinate visible outlets at the project review."),
        ("Interfaces", "Trace proposed sleeves against S-101. Review routes beside access clearances on A-101."),
        ("BOQ references", "M-01 water, waste and fixtures. M-02 power, lighting and commissioning records."),
        ("Field checks", "Log a fictional services inspection and verify that only the published record is visible to the client."),
    ])
    finish(c)


def boq(p, rows):
    c, _, _ = make_pdf(DEST / p["id"] / "QS101-R1.pdf", p, "QS-101", "Priced bill of quantities")
    text(c, 53, 704, "Measured works and client tender rates", 14, True)
    text(c, 53, 686, "Sample rates in KSh. Quantities and totals match the in-app BOQ.", 10, tone=IRON)
    xx = (55, 139, 605, 719, 810, 955)
    y = 651
    box(c, 45, y - 10, 1102, 24, PAPER, LIGHT)
    for x, value in zip(xx, ["ITEM", "DESCRIPTION", "UNIT", "QUANTITY", "RATE (KSh)", "AMOUNT (KSh)"]):
        text(c, x, y, value, 10, True)
    y -= 27
    total = 0
    for row in rows:
        qty = row["quantityMilli"] / 1000
        rate = row["clientRateCents"] / 100
        amount = qty * rate
        total += amount
        values = [row["code"], row["description"], row["unit"], f"{qty:,.0f}", f"{rate:,.2f}", f"{amount:,.2f}"]
        for x, value in zip(xx, values):
            text(c, x, y, value, 10, bold=row["code"].startswith("S-"))
        line(c, 45, y - 7, 1147, y - 7, LIGHT, 0.4)
        y -= 27
    text(c, 795, y - 7, "TOTAL MEASURED WORKS", 11, True)
    text(c, 955, y - 7, f"{total:,.2f}", 12, True)
    text(c, 53, 126, "Structural section S-01–S-06. Separate approvals and contract changes are recorded in the app.", 10, tone=IRON)
    finish(c)


def register(p):
    c, _, _ = make_pdf(DEST / p["id"] / "PR101-R1.pdf", p, "PR-101", "Drawing and handover register")
    text(c, 56, 692, "Project records", 15, True, GREEN)
    fields = [
        ("Scope", p["brief"]), ("Latest update", p["update"]), ("Next step", p["next"]),
        ("Open item", p["issue"]), ("Structural approach", p["structure"] + "."),
        ("Inspection records", "Check current issue, store the sample inspection result, then review the client publication."),
        ("Closeout", "Drawing acknowledgements, defect items, completed commissioning records and client sign-off."),
    ]
    y = 652
    for title, detail in fields:
        text(c, 56, y, title, 11, True)
        lines(c, 245, y, detail, 820)
        line(c, 55, y - 29, 1124, y - 29, LIGHT, .5)
        y -= 66
    finish(c)


def evidence(p, index):
    code = p["code"]
    handed_over = p["progress"] == 100
    ordered = 200 + index * 55
    delivered = ordered if handed_over else int(ordered * 0.8 + 0.5)
    invoiced = delivered if handed_over else int(ordered * 0.66 + 0.5)
    rate = 845 + index * 45
    records = [
        ("delivery.pdf", "DN-" + code, "Delivery note",
         [("Supplier", "Sample supplier " + code), ("Order", "PO-" + code), ("Line", "General purpose cement"),
          ("Ordered", f"{ordered} bags"), ("Received", f"{delivered} bags"), ("Review", "Accepted by sample PM / QS")]),
        ("invoice.pdf", "SUP-" + code, "Supplier invoice",
         [("Supplier", "Sample supplier " + code), ("Order", "PO-" + code), ("Delivery", "DN-" + code), ("Line", f"{invoiced} bags of cement"),
          ("Rate (KSh)", f"{rate:,.2f}"), ("Amount (KSh)", f"{invoiced * rate:,.2f}")]),
        ("cost.pdf", "COST-" + code + "-SITE", "Site cost evidence",
         [("Cost item", "Plant, temporary works and site logistics"), ("Status", "Sample approved expense"),
          ("Supporting record", "Site logistics approval register"), ("Measured work", p["stage"]),
          ("Review", "Sample PM / QS"), ("Reference", "OUT-" + code + "-SITE")]),
    ]
    for filename, number, title, fields in records:
        c, w, h = make_pdf(DEST / p["id"] / filename, p, number, title, size=landscape(A4))
        text(c, 55, h - 146, title, 16, True, GREEN)
        y = h - 193
        for label, v in fields:
            text(c, 55, y, label, 10, True)
            text(c, 248, y, v, 10)
            line(c, 54, y - 8, w - 54, y - 8, LIGHT, 0.6)
            y -= 37
        finish(c)

    # A diagram records the lot and quantity without presenting a fabricated site photograph.
    img = Image.new("RGB", (720, 345), "#eff5f2")
    draw = ImageDraw.Draw(img)
    for j in range(4):
        for i in range(10):
            draw.rounded_rectangle((80 + i * 53, 124 + j * 38, 128 + i * 53, 153 + j * 38), 5,
                                   fill="#d2c9ac", outline="#a2642d")
    draw.text((26, 26), "Illustrated offload record", fill="#214c55", font=ImageFont.load_default(size=22))
    draw.text((26, 65), f"Fictional project   /   {code}   /   {delivered} bags received",
              fill="#214c55", font=ImageFont.load_default(size=15))
    draw.text((26, 306), f"DN-{code}   |   Diagram for CoreConstruct workflow testing",
              fill="#5a7075", font=ImageFont.load_default(size=11))
    img.save(DEST / p["id"] / "offload.jpg", quality=82, optimize=True)


def concept_tiles(path, rows):
    with Image.open(path) as original:
        original = original.convert("RGB")
        width, height = original.size
        for i in range(2 * rows):
            col, row = i % 2, i // 2
            image = original.crop((round(width * col / 2) + 2, round(height * row / rows) + 2,
                round(width * (col + 1) / 2) - 2, round(height * (row + 1) / rows) - 2))
            image.thumbnail((830, 470))
            yield image


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("boq_data", type=Path, help="JSON export of portfolioBoq for the sample projects")
    parser.add_argument("--render-sheets", nargs=2, type=Path, metavar=("SIX", "FOUR"))
    parser.add_argument("--font-dir", type=Path, default=FONT_ROOT)
    args = parser.parse_args()
    pdfmetrics.registerFont(TTFont(REGULAR, str(args.font_dir / "LiberationSans-Regular.ttf")))
    pdfmetrics.registerFont(TTFont(BOLD, str(args.font_dir / "LiberationSans-Bold.ttf")))
    projects = json.loads((ROOT / "preview" / "portfolio-projects.json").read_text())
    data = json.loads(args.boq_data.read_text())
    if args.render_sheets:
        renders = list(concept_tiles(args.render_sheets[0], 3)) + list(concept_tiles(args.render_sheets[1], 2))
    else:
        renders = [None] * len(projects)
    for index, (project, render) in enumerate(zip(projects, renders)):
        folder = DEST / project["id"]
        folder.mkdir(parents=True, exist_ok=True)
        if render:
            render.save(folder / "concept.jpg", quality=85, optimize=True, progressive=True)
        plan(project, 1)
        plan(project, 2)
        elevation(project)
        structural_grid(project)
        structural_section(project)
        services(project)
        boq(project, data[project["id"]])
        register(project)
        evidence(project, index)
    print(f"Built drawing and evidence packages for {len(projects)} fictional projects.")


if __name__ == "__main__":
    main()
