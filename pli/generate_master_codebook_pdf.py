"""Build PLI_Master_Codebook.pdf — Desktop + deliverables/."""
from __future__ import annotations

import re
from pathlib import Path

from pli_pdf import (
    DESK,
    LIGHT,
    PDF,
    S,
    WMLOGO,
    WM_GREEN,
    WM_GOLD,
    png_size,
    write_pdf_outputs,
)

HERE = Path(__file__).resolve().parent
SRC = HERE / "codebook" / "01_PLI_MASTER_CODEBOOK.md"
SRC_LEGACY = HERE / "codebook" / "01_PLI_MULTI_TRACK_MASTER_CODEBOOK.md"
OUT_NAME = "PLI_Master_Codebook.pdf"
LEGACY_PDF = DESK / "PLI_MultiTrack_Master_Codebook.pdf"

BOTTOM = 18
TOP_AFTER_HEADER = 22
LINE_H = 5.0
BULLET_H = 5.0


class MasterPDF(PDF):
    def header(self):
        if self.page_no() <= 1:
            return
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(90, 95, 110)
        self.set_y(10)
        self.cell(
            0,
            6,
            S("PLI Master Codebook  |  Statecraft Simulations Group  |  William & Mary"),
            align="C",
        )
        self.set_draw_color(200, 205, 215)
        self.set_line_width(0.3)
        self.line(self.l_margin, 16, self.w - self.r_margin, 16)
        self.set_y(TOP_AFTER_HEADER)
        self.set_text_color(0, 0, 0)

    def footer(self):
        if self.page_no() <= 1:
            return
        self.set_y(-14)
        self.set_draw_color(200, 205, 215)
        self.set_line_width(0.3)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.set_y(-12)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(90, 95, 110)
        self.cell(0, 8, S(f"Page {self.page_no()}"), align="C")

    def remaining(self) -> float:
        return self.h - BOTTOM - self.get_y()

    def usable(self) -> float:
        return self.h - TOP_AFTER_HEADER - BOTTOM

    def ensure(self, need_mm: float) -> None:
        """Start a new page if the next block will not fit cleanly."""
        if need_mm <= 0:
            return
        # Never strand a block in the last ~12% of the page when it needs more room
        if self.remaining() < need_mm:
            self.add_page()

    def h1(self, text: str) -> None:
        self.add_page()
        self.set_x(self.l_margin)
        self.set_fill_color(*WM_GREEN)
        self.set_text_color(255, 255, 255)
        self.set_font("Helvetica", "B", 14)
        self.multi_cell(0, 9, S("  " + text), fill=True)
        self.set_text_color(0, 0, 0)
        self.ln(4)

    def h2(self, text: str) -> None:
        self.set_x(self.l_margin)
        self.set_text_color(*WM_GREEN)
        self.set_font("Helvetica", "B", 12.5)
        self.multi_cell(0, 7, S(text))
        self.set_draw_color(*WM_GOLD)
        self.set_line_width(0.55)
        y = self.get_y() + 0.8
        self.line(self.l_margin, y, self.w - self.r_margin, y)
        self.ln(3.2)
        self.set_text_color(0, 0, 0)

    def h3(self, text: str) -> None:
        self.set_x(self.l_margin)
        self.set_text_color(31, 59, 110)
        self.set_font("Helvetica", "B", 10.8)
        self.multi_cell(0, 6, S(text))
        self.ln(1.2)
        self.set_text_color(0, 0, 0)

    def para_height(self, text: str, size: float = 9.7) -> float:
        self.set_font("Helvetica", "", size)
        lines = self.multi_cell(
            self.w - self.l_margin - self.r_margin,
            LINE_H,
            S(text),
            dry_run=True,
            output="LINES",
        )
        return len(lines) * LINE_H + 1.6

    def body(self, text: str, size: float = 9.7) -> None:
        h = self.para_height(text, size)
        # Keep short/medium paragraphs intact; only split if taller than a page
        if h <= self.usable():
            self.ensure(h)
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "", size)
        self.set_text_color(25, 25, 25)
        self.multi_cell(0, LINE_H, S(text))
        self.set_x(self.l_margin)
        self.ln(1.6)

    def bullet(self, text: str, size: float = 9.7) -> None:
        self.set_font("Helvetica", "", size)
        avail = self.w - self.l_margin - self.r_margin - 4.5
        lines = self.multi_cell(avail, BULLET_H, S(text), dry_run=True, output="LINES")
        h = len(lines) * BULLET_H + 0.6
        if h <= self.usable():
            self.ensure(h)
        self.set_x(self.l_margin)
        self.set_text_color(25, 25, 25)
        self.cell(4.5, BULLET_H, S("-"))
        self.multi_cell(avail, BULLET_H, S(text))
        self.set_x(self.l_margin)
        self.ln(0.6)

    def code_block(self, text: str) -> None:
        lines = (text or "").split("\n") or [""]
        line_h = 4.4
        pad = 3.5
        h = len(lines) * line_h + pad * 2
        self.ln(1.5)
        if h <= self.usable():
            self.ensure(h + 4)
        x0 = self.l_margin
        y0 = self.get_y()
        w = self.w - self.l_margin - self.r_margin
        self.set_fill_color(245, 247, 250)
        self.set_draw_color(190, 196, 206)
        self.set_line_width(0.35)
        self.rect(x0, y0, w, h, style="DF")
        self.set_font("Courier", "", 8.2)
        self.set_text_color(30, 30, 30)
        y = y0 + pad
        for line in lines:
            self.set_xy(x0 + 3, y)
            self.cell(w - 6, line_h, S(line[:110]))
            y += line_h
        self.set_xy(x0, y0 + h + 2.5)
        self.set_text_color(0, 0, 0)

    def figure(self, path: Path, caption: str | None = None) -> None:
        if not path.exists():
            self.body(f"[Missing figure: {path.name}]")
            return

        self.add_page()
        page_w = self.w - self.l_margin - self.r_margin
        max_h = self.usable() - (16 if caption else 6)
        iw, ih = png_size(path)
        aspect = iw / max(ih, 1)
        w = page_w
        h = w / aspect
        if h > max_h:
            h = max_h
            w = h * aspect
        x = self.l_margin + (page_w - w) / 2
        self.image(str(path), x=x, y=self.get_y(), w=w)
        self.set_y(self.get_y() + h + 3)
        if caption:
            self.set_font("Helvetica", "I", 8.5)
            self.set_text_color(70, 75, 90)
            self.multi_cell(0, 4.5, S(caption), align="C")
            self.set_text_color(0, 0, 0)
            self.ln(2)


def clean(text: str) -> str:
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    text = text.replace("`", "")
    for a, b in (
        ("\u2212", "-"),
        ("\u00b1", "+/-"),
        ("\u2190", "<-"),
        ("\u21d2", "=>"),
        ("\u2260", "!="),
        ("\u2208", "in"),
        ("\u2209", "not in"),
        ("\u2264", "<="),
        ("\u2265", ">="),
        ("\u2192", "->"),
        ("\u2014", "-"),
        ("\u2013", "-"),
    ):
        text = text.replace(a, b)
    return S(text)


def parse_md(path: Path) -> list[tuple[str, object]]:
    lines = path.read_text(encoding="utf-8").splitlines()
    blocks: list[tuple[str, object]] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("# "):
            blocks.append(("h1", line[2:].strip()))
        elif line.startswith("## "):
            blocks.append(("h2", line[3:].strip()))
        elif line.startswith("### "):
            blocks.append(("h3", line[4:].strip()))
        elif line.strip() == "---":
            i += 1
            continue
        elif line.startswith("```"):
            code: list[str] = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                code.append(lines[i])
                i += 1
            blocks.append(("code", "\n".join(code)))
        elif line.startswith("|"):
            table: list[list[str]] = []
            while i < len(lines) and lines[i].startswith("|"):
                if not re.match(r"^\|[-| :]+\|$", lines[i].strip()):
                    cells = [c.strip() for c in lines[i].strip("|").split("|")]
                    table.append(cells)
                i += 1
            blocks.append(("table", table))
            continue
        elif line.strip().startswith("!["):
            m = re.match(r"!\[(.*?)\]\((.+?)\)", line.strip())
            if m:
                blocks.append(("image", (m.group(1), m.group(2))))
        elif line.startswith("- "):
            blocks.append(("bullet", line[2:].strip()))
        elif re.match(r"^\d+\.\s", line.strip()):
            blocks.append(("num", line.strip()))
        elif line.strip():
            # Italic caption lines under figures
            if line.strip().startswith("*") and line.strip().endswith("*"):
                blocks.append(("caption", line.strip().strip("*").strip()))
            else:
                blocks.append(("p", line.strip()))
        i += 1
    return blocks


def table_widths(header: list[str]) -> list[float]:
    n = len(header)
    h = " ".join(header).lower()
    if n == 2:
        if "code" in h:
            return [0.18, 0.82]
        return [0.30, 0.70]
    if n == 3:
        if "tier" in h or "rule" in h:
            return [0.22, 0.55, 0.23]
        if "score" in h:
            return [0.12, 0.22, 0.66]
        return [0.16, 0.28, 0.56]
    if n == 4:
        if "boundary" in h or "definition" in h:
            return [0.10, 0.24, 0.40, 0.26]
        if "instrument" in h and "notes" in h:
            return [0.38, 0.12, 0.14, 0.36]
        return [0.14, 0.22, 0.36, 0.28]
    if n == 5:
        if "action" in h:
            return [0.32, 0.10, 0.12, 0.23, 0.23]
        return [0.14, 0.18, 0.26, 0.20, 0.22]
    if n == 7:
        return [0.22, 0.10, 0.12, 0.14, 0.10, 0.14, 0.18]
    if n == 6:
        return [0.22] + [0.156] * 5
    return [1.0 / n] * n


def _row_height(pdf: MasterPDF, cells: list[str], abs_w: list[float], fs: float, bold: bool) -> float:
    pdf.set_font("Helvetica", "B" if bold else "", fs)
    counts = []
    for j, c in enumerate(cells):
        lines = pdf.multi_cell(abs_w[j] - 2, 4.2, S(str(c)), dry_run=True, output="LINES")
        counts.append(max(1, len(lines)))
    return max(counts) * 4.2 + 1.5


def estimate_table_height(pdf: MasterPDF, rows: list[list[str]], widths: list[float], fs: float) -> float:
    page_w = pdf.w - pdf.l_margin - pdf.r_margin
    abs_w = [page_w * fr for fr in widths]
    return sum(_row_height(pdf, row, abs_w, fs, i == 0) for i, row in enumerate(rows))


def draw_row(
    pdf: MasterPDF,
    cells: list[str],
    abs_w: list[float],
    fs: float,
    bold: bool,
    fill: bool,
) -> None:
    h = _row_height(pdf, cells, abs_w, fs, bold)
    # If a single row won't fit, move to next page first
    if pdf.remaining() < h:
        pdf.add_page()
    x0, y0 = pdf.l_margin, pdf.get_y()
    total_w = sum(abs_w)

    if fill:
        pdf.set_fill_color(*LIGHT)
        x = x0
        for wi in abs_w:
            pdf.rect(x, y0, wi, h, style="F")
            x += wi

    x = x0
    for i, c in enumerate(cells):
        pdf.set_xy(x + 1, y0 + 0.8)
        pdf.set_font("Helvetica", "B" if bold else "", fs)
        pdf.set_text_color(20, 20, 20)
        pdf.multi_cell(abs_w[i] - 2, 4.2, S(str(c)))
        x += abs_w[i]

    pdf.set_draw_color(0, 0, 0)
    pdf.set_line_width(0.2)
    y_bot = y0 + h
    pdf.line(x0, y0, x0 + total_w, y0)
    pdf.line(x0, y_bot, x0 + total_w, y_bot)
    x = x0
    for wi in abs_w:
        pdf.line(x, y0, x, y_bot)
        x += wi
    pdf.line(x, y0, x, y_bot)
    pdf.set_xy(x0, y_bot)


def render_table(pdf: MasterPDF, rows: list[list[str]]) -> None:
    if not rows:
        return
    rows = [[clean(c) for c in row] for row in rows]
    ncols = max(len(r) for r in rows)
    rows = [r + [""] * (ncols - len(r)) for r in rows]
    widths = table_widths(rows[0])
    if len(widths) != ncols:
        widths = [1.0 / ncols] * ncols
    fs = 7.2 if ncols >= 6 else (7.8 if ncols >= 4 else 8.6)

    page_w = pdf.w - pdf.l_margin - pdf.r_margin
    abs_w = [page_w * fr for fr in widths]
    est = estimate_table_height(pdf, rows, widths, fs)
    header, body = rows[0], rows[1:]
    hdr_h = _row_height(pdf, header, abs_w, fs, True)
    min_open = hdr_h + 16  # header + at least a couple of rows

    # Keep whole table together only when it fits in the remaining space.
    # Otherwise start in-place (so a preceding heading is not stranded) and
    # continue with repeated headers — never jump the whole table alone.
    if est <= pdf.remaining():
        draw_row(pdf, header, abs_w, fs, bold=True, fill=True)
        for r in body:
            draw_row(pdf, r, abs_w, fs, bold=False, fill=False)
    else:
        if pdf.remaining() < min_open:
            pdf.add_page()
            if est <= pdf.remaining():
                draw_row(pdf, header, abs_w, fs, bold=True, fill=True)
                for r in body:
                    draw_row(pdf, r, abs_w, fs, bold=False, fill=False)
                pdf.ln(2.5)
                pdf.set_x(pdf.l_margin)
                return
        draw_row(pdf, header, abs_w, fs, bold=True, fill=True)
        for idx, r in enumerate(body):
            need = _row_height(pdf, r, abs_w, fs, False)
            # Avoid a single orphan row on the next page
            if idx < len(body) - 1 and len(body) - idx == 2:
                need_pair = need + _row_height(pdf, body[idx + 1], abs_w, fs, False)
                if pdf.remaining() < need_pair:
                    pdf.add_page()
                    draw_row(pdf, header, abs_w, fs, bold=True, fill=True)
            elif pdf.remaining() < need:
                pdf.add_page()
                draw_row(pdf, header, abs_w, fs, bold=True, fill=True)
            draw_row(pdf, r, abs_w, fs, bold=False, fill=False)

    pdf.ln(2.5)
    pdf.set_x(pdf.l_margin)


def keep_with_next(pdf: MasterPDF, blocks: list, start: int, level: str) -> float:
    """
    Space that must remain so a heading is not stranded without its content.
    Includes the heading plus following intro material and table/code start.
    """
    heading = 12.0 if level == "h2" else 9.0
    need = heading + 4.0
    j = start + 1
    seen_content = 0
    while j < len(blocks) and seen_content < 4:
        kind, content = blocks[j]
        if kind == "h1":
            break
        if kind in ("h2", "h3") and seen_content > 0:
            break
        if kind == "h3" and level == "h2" and seen_content == 0:
            need += 10
            j += 1
            continue
        if kind == "p":
            # Cap so one long paragraph doesn't force premature page breaks forever
            need += min(28.0, 6 + len(str(content)) / 95 * LINE_H)
            seen_content += 1
        elif kind in ("bullet", "num"):
            need += min(14.0, 6 + len(str(content)) / 100 * BULLET_H)
            seen_content += 1
        elif kind == "table":
            rows = content  # type: ignore[assignment]
            ncols = max(len(r) for r in rows) if rows else 2
            fs = 7.2 if ncols >= 6 else (7.8 if ncols >= 4 else 8.6)
            widths = table_widths(rows[0]) if rows else [1.0]
            if len(widths) != ncols:
                widths = [1.0 / max(ncols, 1)] * ncols
            theight = estimate_table_height(pdf, rows, widths, fs)  # type: ignore[arg-type]
            # Keep heading with a solid opening of the table (not necessarily all of it).
            # Full-table reservation left half-empty pages; under-reservation orphaned headings.
            need += min(theight, 64.0)
            seen_content += 1
            break
        elif kind == "code":
            lines = str(content).count("\n") + 1
            cheight = lines * 4.4 + 8
            need += min(cheight, 40.0)
            seen_content += 1
            break
        else:
            break
        j += 1

    # Floor: never leave a heading in the bottom band alone
    floor = 64.0 if level == "h2" else 46.0
    return min(max(need, floor), pdf.usable() - 4)


def cover_page(pdf: MasterPDF) -> None:
    pdf.add_page()
    logo_w = 54
    logo_h = logo_w * 0.667
    if WMLOGO.exists():
        pdf.image(str(WMLOGO), x=(pdf.w - logo_w) / 2, y=18, w=logo_w)
    pdf.set_y(18 + logo_h + 10)
    pdf.set_text_color(*WM_GREEN)
    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(0, 8, S("PETRIHOS LEVER INDEX (PLI)"), align="C")
    pdf.ln(14)
    pdf.set_font("Helvetica", "B", 26)
    pdf.multi_cell(0, 11, S("Fractured Order 2.0"), align="C")
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 16)
    pdf.multi_cell(0, 8, S("Master Codebook"), align="C")
    pdf.ln(3)
    pdf.set_font("Helvetica", "", 11)
    pdf.multi_cell(
        0,
        6,
        S("Macro · National Interest · Glasl Escalation · Diplomacy · Information"),
        align="C",
    )
    pdf.ln(8)
    pdf.set_draw_color(*WM_GOLD)
    pdf.set_line_width(0.65)
    pdf.line(50, pdf.get_y(), pdf.w - 50, pdf.get_y())
    pdf.ln(10)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(30, 30, 30)
    pdf.multi_cell(
        0,
        6.2,
        S(
            "Authoritative adjudication codebook for Fractured Order on Plenum. "
            "Instrument of Power sets the default track map (Diplomatic / Informational / "
            "Military / Economic); action text and bundled tools can open secondary lanes "
            "or flag mislabels for SME review. Macroeconomic adjudication uses "
            "Implementation (1-10) and Fit (1-10) with quarterly indicator trend lines. "
            "Parallel tracks cover National Interest, Glasl escalation, Diplomacy indexing, "
            "and unscored Information briefs."
        ),
        align="C",
    )
    pdf.ln(14)
    pdf.set_font("Helvetica", "", 10.5)
    pdf.multi_cell(
        0,
        6,
        S(
            "Statecraft Simulations Group  |  William & Mary\n"
            "Ben Petrihos, Fellow\n"
            "2026"
        ),
        align="C",
    )


def resolve_src() -> Path:
    if SRC.exists():
        return SRC
    if SRC_LEGACY.exists():
        return SRC_LEGACY
    raise SystemExit(f"Missing source: {SRC}")


def build() -> None:
    src = resolve_src()

    for path in (LEGACY_PDF, DESK / "PLI_MultiTrack_Master_Codebook.pdf"):
        if path.exists():
            path.unlink()

    pdf = MasterPDF(orientation="P", unit="mm", format="A4")
    # Manual breaks only — auto-break mid-paragraph is what created orphans
    pdf.set_auto_page_break(auto=False)
    pdf.set_margins(17, 14, 17)

    cover_page(pdf)

    blocks = parse_md(src)
    start = 0
    for i, (kind, content) in enumerate(blocks):
        if kind == "h1" and str(content).startswith("Part"):
            start = i
            break

    for i in range(start, len(blocks)):
        kind, content = blocks[i]
        if kind == "h1":
            pdf.h1(clean(str(content)))
        elif kind == "h2":
            pdf.ln(2.5)
            pdf.ensure(keep_with_next(pdf, blocks, i, "h2"))
            pdf.h2(clean(str(content)))
        elif kind == "h3":
            pdf.ln(1.5)
            pdf.ensure(keep_with_next(pdf, blocks, i, "h3"))
            pdf.h3(clean(str(content)))
        elif kind == "code":
            pdf.code_block(clean(str(content)))
        elif kind == "table":
            render_table(pdf, content)  # type: ignore[arg-type]
        elif kind == "image":
            alt, rel = content  # type: ignore[misc]
            caption = None
            if i + 1 < len(blocks) and blocks[i + 1][0] == "caption":
                caption = clean(str(blocks[i + 1][1]))
            img_path = SRC.parent / str(rel)
            pdf.figure(img_path, caption=caption)
        elif kind == "caption":
            # Consumed with preceding image when present; standalone captions as italic body
            if i > 0 and blocks[i - 1][0] == "image":
                continue
            pdf.set_font("Helvetica", "I", 8.5)
            pdf.set_text_color(70, 75, 90)
            pdf.multi_cell(0, 4.5, clean(str(content)), align="C")
            pdf.set_text_color(0, 0, 0)
            pdf.ln(2)
        elif kind == "bullet":
            pdf.bullet(clean(str(content)))
        elif kind == "num":
            pdf.bullet(clean(re.sub(r"^\d+\.\s*", "", str(content))))
        elif kind == "p":
            pdf.body(clean(str(content)))

    paths = write_pdf_outputs(pdf, OUT_NAME)
    for path in paths:
        print(f"Created: {path}")
    print(f"Size: {paths[0].stat().st_size:,} bytes")
    print(f"Pages: {pdf.page_no()}")


if __name__ == "__main__":
    build()
