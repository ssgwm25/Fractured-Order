"""Build PLI_Annotated_Bibliography.pdf — Desktop + deliverables/."""
from __future__ import annotations

import re
from pathlib import Path

from pli_pdf import DESK, PDF, S, WMLOGO, WM_GREEN, WM_GOLD, write_pdf_outputs

HERE = Path(__file__).resolve().parent
SRC = HERE / "codebook" / "PLI_Annotated_Bibliography.md"
OUT_NAME = "PLI_Annotated_Bibliography.pdf"


class BibPDF(PDF):
    def header(self):
        return

    def footer(self):
        return

    def code_block(self, text):
        self.ln(1)
        x0, y0 = self.l_margin, self.get_y()
        w = self.w - self.l_margin - self.r_margin
        lines = text.split("\n")
        h = len(lines) * 4.6 + 4
        if y0 + h > self.h - 16:
            self.add_page()
            y0 = self.get_y()
        self.set_fill_color(245, 247, 250)
        self.set_draw_color(200, 205, 215)
        self.set_line_width(0.3)
        self.rect(x0, y0, w, h, style="DF")
        self.set_xy(x0 + 3, y0 + 2)
        self.set_font("Courier", "", 8.6)
        self.set_text_color(30, 30, 30)
        for line in lines:
            self.cell(0, 4.6, S("  " + line), new_x="LMARGIN", new_y="NEXT")
        self.set_xy(x0, y0 + h + 2)
        self.set_text_color(0, 0, 0)


def clean(text: str) -> str:
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    return S(text)


def parse_md(path: Path) -> list:
    lines = path.read_text(encoding="utf-8").splitlines()
    blocks = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("## "):
            blocks.append(("h2", line[3:].strip()))
        elif line.startswith("### "):
            blocks.append(("h3", line[4:].strip()))
        elif line.startswith("# "):
            pass
        elif line.strip() == "---":
            blocks.append(("hr", None))
        elif line.startswith("```"):
            code = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                code.append(lines[i])
                i += 1
            blocks.append(("code", "\n".join(code)))
        elif line.startswith("|"):
            table = []
            while i < len(lines) and lines[i].startswith("|"):
                if not re.match(r"^\|[-| :]+\|$", lines[i].strip()):
                    cells = [c.strip() for c in lines[i].strip("|").split("|")]
                    table.append(cells)
                i += 1
            blocks.append(("table", table))
            continue
        elif line.startswith("- "):
            blocks.append(("bullet", line[2:].strip()))
        elif re.match(r"^\d+\.\s", line.strip()):
            blocks.append(("num", line.strip()))
        elif line.strip():
            blocks.append(("p", line.strip()))
        i += 1
    return blocks


def table_widths(header):
    n = len(header)
    if n == 2:
        return [0.28, 0.72]
    if n == 3:
        return [0.18, 0.32, 0.50]
    if n == 4:
        return [0.12, 0.28, 0.30, 0.30]
    return [1.0 / n] * n


def render_table(pdf, rows):
    if not rows:
        return
    rows = [[clean(c) for c in row] for row in rows]
    widths = table_widths(rows[0])
    fs = 8.2 if len(rows[0]) >= 4 else 8.8
    pdf.table(rows, widths, fs=fs)


def cover_page(pdf):
    pdf.add_page()
    logo_w = 54
    logo_h = logo_w * 0.667
    if WMLOGO.exists():
        pdf.image(str(WMLOGO), x=(pdf.w - logo_w) / 2, y=16, w=logo_w)
    pdf.set_y(16 + logo_h + 8)
    pdf.set_text_color(*WM_GREEN)
    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(0, 8, S("PETRIHOS LEVER INDEX (PLI)"), align="C")
    pdf.ln(14)
    pdf.set_font("Helvetica", "B", 25)
    pdf.multi_cell(0, 11, S("Fractured Order 2.0"), align="C")
    pdf.ln(1)
    pdf.set_font("Helvetica", "B", 16)
    pdf.multi_cell(0, 9, S("Annotated Bibliography"), align="C")
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 11)
    pdf.multi_cell(
        0,
        6,
        S("Macro · National Interest · Escalation / Glasl · Diplomacy · Information"),
        align="C",
    )
    pdf.ln(6)
    pdf.set_draw_color(*WM_GOLD)
    pdf.set_line_width(0.6)
    pdf.line(55, pdf.get_y(), pdf.w - 55, pdf.get_y())
    pdf.ln(8)
    pdf.set_font("Helvetica", "", 11.5)
    pdf.set_text_color(0, 0, 0)
    pdf.multi_cell(
        0,
        6,
        S(
            "Source documentation for all PLI adjudication tracks: macroeconomic baseline "
            "and lever matrix (Sources 1-10); National Interest (11-14); Glasl escalation "
            "(15-17); Diplomacy indexing (18-20); and Information SME briefs (21-22). "
            "Each source is tagged to the model it grounds."
        ),
        align="C",
    )
    pdf.ln(12)
    pdf.set_font("Helvetica", "", 10.5)
    pdf.multi_cell(
        0,
        6,
        S(
            "Statecraft Simulations Group  |  William & Mary\n"
            "Ben Petrihos, Senior Fellow\n"
            "2026"
        ),
        align="C",
    )


def build():
    if not SRC.exists():
        raise SystemExit(f"Missing source: {SRC}")

    pdf = BibPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.set_margins(16, 14, 16)

    cover_page(pdf)
    pdf.add_page()
    pdf.set_y(pdf.t_margin + 2)

    for kind, content in parse_md(SRC):
        if kind == "h2":
            pdf.h2(clean(content))
        elif kind == "h3":
            pdf.h3(clean(content))
        elif kind == "hr":
            pdf.ln(2)
        elif kind == "code":
            pdf.code_block(clean(content))
        elif kind == "table":
            render_table(pdf, content)
            pdf.ln(2)
        elif kind == "bullet":
            pdf.bullet(clean(content))
        elif kind == "num":
            pdf.bullet(clean(re.sub(r"^\d+\.\s*", "", content)))
        elif kind == "p":
            pdf.body(clean(content), size=9.8)

    paths = write_pdf_outputs(pdf, OUT_NAME)
    for path in paths:
        print(f"Created: {path}")
    print(f"Size: {paths[0].stat().st_size:,} bytes")
    print(f"Pages: {pdf.page_no()}")


if __name__ == "__main__":
    build()
