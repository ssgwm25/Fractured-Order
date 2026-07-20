"""Shared PLI PDF brand helpers (self-contained — no sibling-repo imports)."""
from __future__ import annotations

import struct
from pathlib import Path

from fpdf import FPDF

HERE = Path(__file__).resolve().parent
ASSETS = HERE / "assets"
DESK = Path.home() / "Desktop"
DELIVERABLES = HERE / "deliverables"
WMLOGO = ASSETS / "WM_Logo_official.png"

# ---- colors ----
NAVY = (31, 59, 110)
NAVY_T = (20, 40, 80)
GREY = (90, 95, 110)
LIGHT = (235, 239, 247)
WM_GREEN = (0, 78, 54)
WM_GOLD = (182, 146, 86)


def png_size(path: Path) -> tuple[int, int]:
    with open(path, "rb") as f:
        head = f.read(24)
    w, h = struct.unpack(">II", head[16:24])
    return w, h


def S(text: str) -> str:
    """Latin-1 safe text."""
    repl = {
        "\u2192": "->",
        "\u2014": "-",
        "\u2013": "-",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2026": "...",
        "\u2265": ">=",
        "\u2264": "<=",
        "\u00d7": "x",
        "\u2018": "'",
        "\u2022": "-",
        "\u2009": " ",
        "\u00a0": " ",
        "\u2011": "-",
    }
    for a, b in repl.items():
        text = text.replace(a, b)
    return text.encode("latin-1", "replace").decode("latin-1")


class PDF(FPDF):
    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "I", 7.5)
        self.set_text_color(*GREY)
        self.cell(
            0,
            8,
            S("PLI  |  Statecraft Simulations Group  |  William & Mary"),
            align="C",
        )
        self.ln(9)
        self.set_text_color(0, 0, 0)

    def footer(self):
        return

    def h1(self, text, new_page=True):
        if new_page:
            self.add_page()
        self.set_fill_color(*NAVY)
        self.set_text_color(255, 255, 255)
        self.set_font("Helvetica", "B", 15)
        self.multi_cell(0, 10, S("  " + text), fill=True)
        self.set_text_color(0, 0, 0)
        self.ln(3)

    def h2(self, text):
        self.ln(1)
        if self.get_y() > 250:
            self.add_page()
        self.set_text_color(*NAVY_T)
        self.set_font("Helvetica", "B", 12.5)
        self.multi_cell(0, 7, S(text))
        self.set_text_color(0, 0, 0)
        self.set_draw_color(*NAVY)
        self.set_line_width(0.4)
        x = self.l_margin
        self.line(x, self.get_y() + 0.5, self.w - self.r_margin, self.get_y() + 0.5)
        self.ln(2.5)

    def h3(self, text):
        self.ln(1)
        if self.get_y() > 258:
            self.add_page()
        self.set_text_color(*NAVY_T)
        self.set_font("Helvetica", "B", 10.8)
        self.multi_cell(0, 6, S(text))
        self.set_text_color(0, 0, 0)
        self.ln(0.5)

    def body(self, text, size=10, gap=1.4):
        self.set_font("Helvetica", "", size)
        self.set_text_color(20, 20, 20)
        self.multi_cell(0, 5.2, S(text))
        self.set_text_color(0, 0, 0)
        self.ln(gap)

    def bullet(self, text, size=10, label=None):
        self.set_font("Helvetica", "", size)
        self.set_text_color(20, 20, 20)
        x = self.get_x()
        self.cell(5, 5.2, S("-"))
        if label:
            self.set_font("Helvetica", "B", size)
            lbl = S(label + " ")
            self.cell(self.get_string_width(lbl), 5.2, lbl)
            self.set_font("Helvetica", "", size)
        self.multi_cell(0, 5.2, S(text))
        self.set_x(x)
        self.set_text_color(0, 0, 0)

    def _row_height(self, cells, widths, fs, bold):
        self.set_font("Helvetica", "B" if bold else "", fs)
        line_counts = []
        for i, c in enumerate(cells):
            lines = self.multi_cell(widths[i] - 2, 4.4, S(str(c)), dry_run=True, output="LINES")
            line_counts.append(max(1, len(lines)))
        return max(line_counts) * 4.4 + 1.6

    def table(self, rows, widths, fs=8.5, header=True, align=None, keep_together=True):
        page_w = self.w - self.l_margin - self.r_margin
        widths = [page_w * fr for fr in widths]
        align = align or ["L"] * len(widths)
        bottom = 16
        usable = self.h - self.t_margin - bottom

        body = rows[1:] if header else rows
        header_row = rows[0] if header else None
        heights = []
        if header_row:
            heights.append(self._row_height(header_row, widths, fs, True))
        for r in body:
            heights.append(self._row_height(r, widths, fs, False))
        total_h = sum(heights)

        if keep_together and total_h <= usable and self.get_y() + total_h > self.h - bottom:
            self.add_page()

        if header_row:
            self.set_fill_color(*LIGHT)
            self._row(
                header_row,
                widths,
                fs,
                bold=True,
                align=align,
                fill=True,
                allow_break=not keep_together or total_h > usable,
            )
        for r in body:
            self._row(
                r,
                widths,
                fs,
                bold=False,
                align=align,
                fill=False,
                allow_break=not keep_together or total_h > usable,
            )

    def _row(self, cells, widths, fs, bold, align, fill, allow_break=True):
        self.set_font("Helvetica", "B" if bold else "", fs)
        h = self._row_height(cells, widths, fs, bold)
        if allow_break and self.get_y() + h > self.h - 16:
            self.add_page()
        x0, y0 = self.get_x(), self.get_y()
        total_w = sum(widths)

        if fill:
            self.set_fill_color(*LIGHT)
            x = x0
            for wi in widths:
                self.rect(x, y0, wi, h, style="F")
                x += wi

        x = x0
        for i, c in enumerate(cells):
            self.set_xy(x + 1, y0 + 0.8)
            self.set_font("Helvetica", "B" if bold else "", fs)
            self.multi_cell(widths[i] - 2, 4.4, S(str(c)), align=align[i])
            x += widths[i]

        self.set_draw_color(0, 0, 0)
        self.set_line_width(0.2)
        y_bot = y0 + h
        self.line(x0, y0, x0 + total_w, y0)
        self.line(x0, y_bot, x0 + total_w, y_bot)
        x = x0
        for wi in widths:
            self.line(x, y0, x, y_bot)
            x += wi
        self.line(x, y0, x, y_bot)
        self.set_xy(x0, y0 + h)


def write_pdf_outputs(pdf: FPDF, filename: str) -> list[Path]:
    """Write PDF to Desktop and deliverables/; return paths written."""
    DELIVERABLES.mkdir(parents=True, exist_ok=True)
    DESK.mkdir(parents=True, exist_ok=True)
    paths = [DESK / filename, DELIVERABLES / filename]
    data = pdf.output()
    for path in paths:
        path.write_bytes(data)
    return paths
