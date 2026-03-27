from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASE_DIR = Path(__file__).resolve().parent
SOURCE_PATH = BASE_DIR / "khosrow_daughter.drawio"
OUTPUT_PATH = BASE_DIR / "khosrow_daughter.hadith-graph.json"


@dataclass(frozen=True)
class ReportSpec:
    report_id: str
    chain_ids: tuple[str, ...]
    text_id: str
    x_offset: float = 0
    y_offset: float = 0


REPORT_SPECS: tuple[ReportSpec, ...] = (
    ReportSpec(
        report_id="khosrow-daughter-01",
        chain_ids=(
            "lOqWJcGC6gH-27NqQ_Zj-1",
            "lOqWJcGC6gH-27NqQ_Zj-115",
            "lOqWJcGC6gH-27NqQ_Zj-114",
            "lOqWJcGC6gH-27NqQ_Zj-109",
            "lOqWJcGC6gH-27NqQ_Zj-111",
            "lOqWJcGC6gH-27NqQ_Zj-112",
            "lOqWJcGC6gH-27NqQ_Zj-116",
        ),
        text_id="lOqWJcGC6gH-27NqQ_Zj-117",
    ),
    ReportSpec(
        report_id="khosrow-daughter-02",
        chain_ids=(
            "lOqWJcGC6gH-27NqQ_Zj-1",
            "lOqWJcGC6gH-27NqQ_Zj-2",
            "lOqWJcGC6gH-27NqQ_Zj-102",
            "lOqWJcGC6gH-27NqQ_Zj-97",
            "lOqWJcGC6gH-27NqQ_Zj-99",
            "lOqWJcGC6gH-27NqQ_Zj-100",
            "lOqWJcGC6gH-27NqQ_Zj-103",
        ),
        text_id="lOqWJcGC6gH-27NqQ_Zj-104",
    ),
    ReportSpec(
        report_id="khosrow-daughter-03",
        chain_ids=(
            "lOqWJcGC6gH-27NqQ_Zj-1",
            "lOqWJcGC6gH-27NqQ_Zj-2",
            "lOqWJcGC6gH-27NqQ_Zj-3",
            "lOqWJcGC6gH-27NqQ_Zj-4",
            "lOqWJcGC6gH-27NqQ_Zj-22",
            "lOqWJcGC6gH-27NqQ_Zj-23",
        ),
        text_id="lOqWJcGC6gH-27NqQ_Zj-25",
    ),
    ReportSpec(
        report_id="khosrow-daughter-04",
        chain_ids=(
            "lOqWJcGC6gH-27NqQ_Zj-1",
            "lOqWJcGC6gH-27NqQ_Zj-2",
            "lOqWJcGC6gH-27NqQ_Zj-3",
            "lOqWJcGC6gH-27NqQ_Zj-4",
            "lOqWJcGC6gH-27NqQ_Zj-17",
            "lOqWJcGC6gH-27NqQ_Zj-18",
        ),
        text_id="lOqWJcGC6gH-27NqQ_Zj-20",
    ),
    ReportSpec(
        report_id="khosrow-daughter-05",
        chain_ids=(
            "lOqWJcGC6gH-27NqQ_Zj-1",
            "lOqWJcGC6gH-27NqQ_Zj-2",
            "lOqWJcGC6gH-27NqQ_Zj-3",
            "lOqWJcGC6gH-27NqQ_Zj-4",
            "lOqWJcGC6gH-27NqQ_Zj-11",
            "lOqWJcGC6gH-27NqQ_Zj-13",
        ),
        text_id="lOqWJcGC6gH-27NqQ_Zj-15",
    ),
    ReportSpec(
        report_id="khosrow-daughter-06",
        chain_ids=(
            "lOqWJcGC6gH-27NqQ_Zj-1",
            "lOqWJcGC6gH-27NqQ_Zj-2",
            "lOqWJcGC6gH-27NqQ_Zj-3",
            "lOqWJcGC6gH-27NqQ_Zj-4",
            "lOqWJcGC6gH-27NqQ_Zj-8",
        ),
        text_id="lOqWJcGC6gH-27NqQ_Zj-10",
    ),
    ReportSpec(
        report_id="khosrow-daughter-07",
        chain_ids=(
            "lOqWJcGC6gH-27NqQ_Zj-1",
            "lOqWJcGC6gH-27NqQ_Zj-2",
            "lOqWJcGC6gH-27NqQ_Zj-3",
            "lOqWJcGC6gH-27NqQ_Zj-28",
            "lOqWJcGC6gH-27NqQ_Zj-30",
            "lOqWJcGC6gH-27NqQ_Zj-31",
            "lOqWJcGC6gH-27NqQ_Zj-26",
        ),
        text_id="lOqWJcGC6gH-27NqQ_Zj-35",
    ),
    ReportSpec(
        report_id="khosrow-daughter-08",
        chain_ids=(
            "lOqWJcGC6gH-27NqQ_Zj-1",
            "lOqWJcGC6gH-27NqQ_Zj-2",
            "lOqWJcGC6gH-27NqQ_Zj-83",
            "eEYxFlhBp-DMziQTyEQt-23",
            "eEYxFlhBp-DMziQTyEQt-46",
            "eEYxFlhBp-DMziQTyEQt-52",
            "eEYxFlhBp-DMziQTyEQt-54",
        ),
        text_id="eEYxFlhBp-DMziQTyEQt-55",
    ),
    ReportSpec(
        report_id="khosrow-daughter-09",
        chain_ids=(
            "lOqWJcGC6gH-27NqQ_Zj-1",
            "lOqWJcGC6gH-27NqQ_Zj-2",
            "lOqWJcGC6gH-27NqQ_Zj-83",
            "eEYxFlhBp-DMziQTyEQt-23",
            "eEYxFlhBp-DMziQTyEQt-46",
            "eEYxFlhBp-DMziQTyEQt-47",
            "eEYxFlhBp-DMziQTyEQt-49",
        ),
        text_id="eEYxFlhBp-DMziQTyEQt-50",
    ),
    ReportSpec(
        report_id="khosrow-daughter-10",
        chain_ids=(
            "lOqWJcGC6gH-27NqQ_Zj-1",
            "lOqWJcGC6gH-27NqQ_Zj-2",
            "lOqWJcGC6gH-27NqQ_Zj-83",
            "eEYxFlhBp-DMziQTyEQt-23",
            "eEYxFlhBp-DMziQTyEQt-39",
            "eEYxFlhBp-DMziQTyEQt-40",
            "eEYxFlhBp-DMziQTyEQt-41",
        ),
        text_id="eEYxFlhBp-DMziQTyEQt-42",
    ),
    ReportSpec(
        report_id="khosrow-daughter-11",
        chain_ids=(
            "lOqWJcGC6gH-27NqQ_Zj-1",
            "lOqWJcGC6gH-27NqQ_Zj-2",
            "lOqWJcGC6gH-27NqQ_Zj-83",
            "eEYxFlhBp-DMziQTyEQt-23",
            "eEYxFlhBp-DMziQTyEQt-39",
            "eEYxFlhBp-DMziQTyEQt-57",
            "eEYxFlhBp-DMziQTyEQt-58",
            "eEYxFlhBp-DMziQTyEQt-61",
        ),
        text_id="eEYxFlhBp-DMziQTyEQt-62",
    ),
    ReportSpec(
        report_id="khosrow-daughter-12",
        chain_ids=(
            "lOqWJcGC6gH-27NqQ_Zj-1",
            "lOqWJcGC6gH-27NqQ_Zj-2",
            "lOqWJcGC6gH-27NqQ_Zj-83",
            "eEYxFlhBp-DMziQTyEQt-23",
            "eEYxFlhBp-DMziQTyEQt-25",
            "eEYxFlhBp-DMziQTyEQt-28",
        ),
        text_id="eEYxFlhBp-DMziQTyEQt-29",
    ),
    ReportSpec(
        report_id="khosrow-daughter-13",
        chain_ids=(
            "lOqWJcGC6gH-27NqQ_Zj-1",
            "lOqWJcGC6gH-27NqQ_Zj-2",
            "lOqWJcGC6gH-27NqQ_Zj-83",
            "eEYxFlhBp-DMziQTyEQt-23",
            "eEYxFlhBp-DMziQTyEQt-32",
            "eEYxFlhBp-DMziQTyEQt-33",
            "eEYxFlhBp-DMziQTyEQt-35",
        ),
        text_id="eEYxFlhBp-DMziQTyEQt-37",
    ),
    ReportSpec(
        report_id="khosrow-daughter-14",
        chain_ids=(
            "lOqWJcGC6gH-27NqQ_Zj-1",
            "lOqWJcGC6gH-27NqQ_Zj-2",
            "lOqWJcGC6gH-27NqQ_Zj-83",
            "lOqWJcGC6gH-27NqQ_Zj-79",
            "lOqWJcGC6gH-27NqQ_Zj-81",
            "lOqWJcGC6gH-27NqQ_Zj-82",
            "lOqWJcGC6gH-27NqQ_Zj-88",
        ),
        text_id="lOqWJcGC6gH-27NqQ_Zj-86",
    ),
    ReportSpec(
        report_id="khosrow-daughter-15",
        chain_ids=(
            "lOqWJcGC6gH-27NqQ_Zj-1",
            "lOqWJcGC6gH-27NqQ_Zj-2",
            "lOqWJcGC6gH-27NqQ_Zj-37",
            "lOqWJcGC6gH-27NqQ_Zj-39",
            "lOqWJcGC6gH-27NqQ_Zj-74",
            "lOqWJcGC6gH-27NqQ_Zj-75",
            "lOqWJcGC6gH-27NqQ_Zj-69",
        ),
        text_id="lOqWJcGC6gH-27NqQ_Zj-72",
    ),
    ReportSpec(
        report_id="khosrow-daughter-16",
        chain_ids=(
            "lOqWJcGC6gH-27NqQ_Zj-1",
            "lOqWJcGC6gH-27NqQ_Zj-2",
            "lOqWJcGC6gH-27NqQ_Zj-37",
            "lOqWJcGC6gH-27NqQ_Zj-47",
            "lOqWJcGC6gH-27NqQ_Zj-49",
            "lOqWJcGC6gH-27NqQ_Zj-50",
            "lOqWJcGC6gH-27NqQ_Zj-69",
        ),
        text_id="lOqWJcGC6gH-27NqQ_Zj-72",
        y_offset=-90,
    ),
    ReportSpec(
        report_id="khosrow-daughter-17",
        chain_ids=(
            "lOqWJcGC6gH-27NqQ_Zj-1",
            "lOqWJcGC6gH-27NqQ_Zj-2",
            "lOqWJcGC6gH-27NqQ_Zj-37",
            "lOqWJcGC6gH-27NqQ_Zj-39",
            "lOqWJcGC6gH-27NqQ_Zj-40",
            "eEYxFlhBp-DMziQTyEQt-2",
            "eEYxFlhBp-DMziQTyEQt-3",
            "eEYxFlhBp-DMziQTyEQt-4",
            "eEYxFlhBp-DMziQTyEQt-6",
        ),
        text_id="eEYxFlhBp-DMziQTyEQt-9",
    ),
    ReportSpec(
        report_id="khosrow-daughter-18",
        chain_ids=(
            "lOqWJcGC6gH-27NqQ_Zj-1",
            "lOqWJcGC6gH-27NqQ_Zj-2",
            "lOqWJcGC6gH-27NqQ_Zj-37",
            "lOqWJcGC6gH-27NqQ_Zj-39",
            "lOqWJcGC6gH-27NqQ_Zj-40",
            "lOqWJcGC6gH-27NqQ_Zj-41",
        ),
        text_id="lOqWJcGC6gH-27NqQ_Zj-43",
    ),
    ReportSpec(
        report_id="khosrow-daughter-19",
        chain_ids=(
            "lOqWJcGC6gH-27NqQ_Zj-1",
            "lOqWJcGC6gH-27NqQ_Zj-2",
            "lOqWJcGC6gH-27NqQ_Zj-37",
            "lOqWJcGC6gH-27NqQ_Zj-47",
            "lOqWJcGC6gH-27NqQ_Zj-49",
            "lOqWJcGC6gH-27NqQ_Zj-50",
            "lOqWJcGC6gH-27NqQ_Zj-121",
            "lOqWJcGC6gH-27NqQ_Zj-123",
            "lOqWJcGC6gH-27NqQ_Zj-125",
        ),
        text_id="lOqWJcGC6gH-27NqQ_Zj-124",
    ),
    ReportSpec(
        report_id="khosrow-daughter-20",
        chain_ids=(
            "lOqWJcGC6gH-27NqQ_Zj-1",
            "lOqWJcGC6gH-27NqQ_Zj-2",
            "lOqWJcGC6gH-27NqQ_Zj-37",
            "lOqWJcGC6gH-27NqQ_Zj-47",
            "lOqWJcGC6gH-27NqQ_Zj-49",
            "lOqWJcGC6gH-27NqQ_Zj-50",
            "lOqWJcGC6gH-27NqQ_Zj-52",
        ),
        text_id="lOqWJcGC6gH-27NqQ_Zj-53",
    ),
    ReportSpec(
        report_id="khosrow-daughter-21",
        chain_ids=(
            "lOqWJcGC6gH-27NqQ_Zj-1",
            "lOqWJcGC6gH-27NqQ_Zj-2",
            "lOqWJcGC6gH-27NqQ_Zj-37",
            "lOqWJcGC6gH-27NqQ_Zj-47",
            "lOqWJcGC6gH-27NqQ_Zj-49",
            "lOqWJcGC6gH-27NqQ_Zj-50",
            "lOqWJcGC6gH-27NqQ_Zj-90",
        ),
        text_id="lOqWJcGC6gH-27NqQ_Zj-92",
    ),
    ReportSpec(
        report_id="khosrow-daughter-22",
        chain_ids=(
            "lOqWJcGC6gH-27NqQ_Zj-1",
            "lOqWJcGC6gH-27NqQ_Zj-2",
            "lOqWJcGC6gH-27NqQ_Zj-37",
            "lOqWJcGC6gH-27NqQ_Zj-47",
            "lOqWJcGC6gH-27NqQ_Zj-49",
            "lOqWJcGC6gH-27NqQ_Zj-50",
            "lOqWJcGC6gH-27NqQ_Zj-93",
        ),
        text_id="lOqWJcGC6gH-27NqQ_Zj-94",
    ),
    ReportSpec(
        report_id="khosrow-daughter-23",
        chain_ids=(
            "lOqWJcGC6gH-27NqQ_Zj-1",
            "lOqWJcGC6gH-27NqQ_Zj-2",
            "lOqWJcGC6gH-27NqQ_Zj-37",
            "lOqWJcGC6gH-27NqQ_Zj-47",
            "lOqWJcGC6gH-27NqQ_Zj-49",
            "eEYxFlhBp-DMziQTyEQt-12",
            "eEYxFlhBp-DMziQTyEQt-14",
            "eEYxFlhBp-DMziQTyEQt-15",
            "eEYxFlhBp-DMziQTyEQt-17",
        ),
        text_id="eEYxFlhBp-DMziQTyEQt-16",
    ),
    ReportSpec(
        report_id="khosrow-daughter-24",
        chain_ids=(
            "lOqWJcGC6gH-27NqQ_Zj-1",
            "lOqWJcGC6gH-27NqQ_Zj-2",
            "lOqWJcGC6gH-27NqQ_Zj-64",
            "lOqWJcGC6gH-27NqQ_Zj-37",
            "lOqWJcGC6gH-27NqQ_Zj-58",
            "lOqWJcGC6gH-27NqQ_Zj-59",
            "lOqWJcGC6gH-27NqQ_Zj-61",
        ),
        text_id="lOqWJcGC6gH-27NqQ_Zj-63",
    ),
)

DRAWIO_HIGHLIGHT_LEGEND = {
    "#3333ff": {"id": "drawio-blue", "label": "Blue"},
    "#33ff33": {"id": "drawio-green", "label": "Green"},
    "#33ffff": {"id": "drawio-cyan", "label": "Cyan"},
    "#ff3333": {"id": "drawio-red", "label": "Red"},
    "#ff9933": {"id": "drawio-orange", "label": "Orange"},
    "#ff9999": {"id": "drawio-pink", "label": "Pink"},
    "#ffff33": {"id": "drawio-yellow", "label": "Yellow"},
}


class HighlightHtmlParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[tuple[str, str | None]] = []
        self.color_stack: list[str | None] = [None]

    def push_text(self, text: str, color: str | None = None) -> None:
        if text:
            self.parts.append((text, self.color_stack[-1] if color is None else color))

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = dict(attrs)
        if tag == "br":
            self.push_text("\n", None)
            return

        color = self.color_stack[-1]
        style = attrs_dict.get("style", "")
        rgb_values = re.findall(r"rgb\((\d+),\s*(\d+),\s*(\d+)\)", style)
        if rgb_values:
            red, green, blue = map(int, rgb_values[-1])
            if (red, green, blue) not in {(0, 0, 0), (255, 255, 255)}:
                color = f"#{red:02x}{green:02x}{blue:02x}"
        self.color_stack.append(color)

    def handle_endtag(self, tag: str) -> None:
        if tag == "div":
            self.push_text("\n", None)
        if len(self.color_stack) > 1:
            self.color_stack.pop()

    def handle_data(self, data: str) -> None:
        self.push_text(data)


def clean_text(raw: str) -> str:
    text = unescape(raw)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</div\s*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return "\n".join(line.strip() for line in text.splitlines()).strip()


def normalize_text(value: str) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n").strip()


def current_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def normalize_highlight_parts(parts: list[tuple[str, str | None]]) -> list[tuple[str, str | None]]:
    characters: list[tuple[str, str | None]] = []
    for text, color in parts:
        for char in text.replace("\xa0", " "):
            characters.append((char, color))

    collapsed_spaces: list[tuple[str, str | None]] = []
    index = 0
    while index < len(characters):
        char, color = characters[index]
        if char in {" ", "\t"}:
            while index < len(characters) and characters[index][0] in {" ", "\t"}:
                index += 1
            collapsed_spaces.append((" ", color))
            continue
        collapsed_spaces.append((char, color))
        index += 1

    collapsed_newlines: list[tuple[str, str | None]] = []
    index = 0
    while index < len(collapsed_spaces):
        char, color = collapsed_spaces[index]
        if char == "\n":
            run_end = index
            while run_end < len(collapsed_spaces) and collapsed_spaces[run_end][0] == "\n":
                run_end += 1
            collapsed_newlines.extend([("\n", None)] * min(2, run_end - index))
            index = run_end
            continue
        collapsed_newlines.append((char, color))
        index += 1

    lines: list[list[tuple[str, str | None]]] = []
    current_line: list[tuple[str, str | None]] = []
    for char, color in collapsed_newlines:
        if char == "\n":
            while current_line and current_line[-1][0] == " ":
                current_line.pop()
            lines.append(current_line)
            current_line = []
            continue
        current_line.append((char, color))

    while current_line and current_line[-1][0] == " ":
        current_line.pop()
    lines.append(current_line)

    for line in lines:
        while line and line[0][0] == " ":
            line.pop(0)

    while lines and not lines[0]:
        lines.pop(0)
    while lines and not lines[-1]:
        lines.pop()

    normalized: list[tuple[str, str | None]] = []
    for line_index, line in enumerate(lines):
        normalized.extend(line)
        if line_index < len(lines) - 1:
            normalized.append(("\n", None))

    return normalized


def build_matn_and_highlights(raw_html: str) -> tuple[str, list[dict[str, object]]]:
    parser = HighlightHtmlParser()
    parser.feed(raw_html)
    normalized_parts = normalize_highlight_parts(parser.parts)
    matn = "".join(char for char, _ in normalized_parts)

    highlights: list[dict[str, object]] = []
    start: int | None = None
    active_color: str | None = None

    for index, entry in enumerate(normalized_parts + [(None, None)]):
        _, color = entry
        if index < len(normalized_parts) and color is not None:
            if start is None:
                start = index
                active_color = color
            elif color != active_color:
                if active_color in DRAWIO_HIGHLIGHT_LEGEND:
                    highlights.append(
                        {
                            "color": active_color,
                            "start": start,
                            "end": index,
                        }
                    )
                start = index
                active_color = color
            continue

        if start is not None and active_color in DRAWIO_HIGHLIGHT_LEGEND:
            highlights.append(
                {
                    "color": active_color,
                    "start": start,
                    "end": index,
                }
            )
        start = None
        active_color = None

    return matn, highlights


def load_cells() -> dict[str, dict[str, object]]:
    tree = ET.parse(SOURCE_PATH)
    cells: dict[str, dict[str, object]] = {}
    for cell in tree.iterfind(".//mxCell"):
        cell_id = cell.attrib.get("id")
        if not cell_id or cell.attrib.get("vertex") != "1":
            continue

        geometry = cell.find("mxGeometry")
        cells[cell_id] = {
            "id": cell_id,
            "raw_html": cell.attrib.get("value", ""),
            "style": cell.attrib.get("style", ""),
            "text": clean_text(cell.attrib.get("value", "")),
            "x": float(geometry.attrib["x"]) if geometry is not None and "x" in geometry.attrib else None,
            "y": float(geometry.attrib["y"]) if geometry is not None and "y" in geometry.attrib else None,
            "width": float(geometry.attrib["width"]) if geometry is not None and "width" in geometry.attrib else None,
            "height": float(geometry.attrib["height"]) if geometry is not None and "height" in geometry.attrib else None,
        }
    return cells


def infer_missing_positions(cells: dict[str, dict[str, object]]) -> None:
    # The draw.io file omits y for two upper-level narrator nodes.
    inferred_y = {
        "lOqWJcGC6gH-27NqQ_Zj-102": -20.0,
        "lOqWJcGC6gH-27NqQ_Zj-114": -20.0,
    }
    for cell_id, y in inferred_y.items():
        if cell_id in cells and cells[cell_id]["y"] is None:
            cells[cell_id]["y"] = y


def normalize_legacy_matn_node_ids[T](input_map: dict[str, T]) -> dict[str, T]:
    normalized: dict[str, T] = {}
    for node_id, value in input_map.items():
        if node_id.startswith("r:"):
            normalized[f"m:{node_id[2:]}"] = value
        else:
            normalized[node_id] = value
    return normalized


def build_bundle() -> dict[str, object]:
    cells = load_cells()
    infer_missing_positions(cells)
    existing_bundle = json.loads(OUTPUT_PATH.read_text(encoding="utf-8")) if OUTPUT_PATH.exists() else None
    existing_reports_by_id = {
        report["id"]: report for report in existing_bundle.get("reports", [])
    } if existing_bundle else {}

    for spec in REPORT_SPECS:
        for cell_id in (*spec.chain_ids, spec.text_id):
            if cell_id not in cells:
                raise KeyError(f"Missing draw.io cell: {cell_id}")

    shared_narrator_positions: defaultdict[str, list[tuple[float, float]]] = defaultdict(list)
    collector_positions: dict[str, tuple[float, float]] = {}
    report_positions: dict[str, tuple[float, float]] = {}
    report_widths: dict[str, float] = {}
    reports: list[dict[str, object]] = []
    used_highlight_colors: list[str] = []
    text_usage = Counter[str]()

    for spec in REPORT_SPECS:
        isnad = [normalize_text(str(cells[cell_id]["text"])) for cell_id in spec.chain_ids]
        matn, extracted_highlights = build_matn_and_highlights(str(cells[spec.text_id]["raw_html"]))
        existing_report = existing_reports_by_id.get(spec.report_id)
        if existing_report and existing_report.get("matn") != matn:
            raise ValueError(
                f"Existing report {spec.report_id} matn no longer matches the draw.io source; "
                "refusing to overwrite preserved bundle data."
            )
        used_highlight_colors.extend(str(item["color"]) for item in extracted_highlights)

        reports.append(
            {
                "id": spec.report_id,
                "isnad": existing_report.get("isnad", isnad) if existing_report else isnad,
                "matn": existing_report.get("matn", matn) if existing_report else matn,
                "matnHighlights": [
                    {
                        "id": f"{spec.report_id}-highlight-{highlight_index + 1}",
                        "legendId": DRAWIO_HIGHLIGHT_LEGEND[str(item["color"])]["id"],
                        "start": int(item["start"]),
                        "end": int(item["end"]),
                    }
                    for highlight_index, item in enumerate(extracted_highlights)
                ],
                "createdAt": existing_report.get("createdAt", "2026-03-25T00:00:00.000Z")
                if existing_report
                else "2026-03-25T00:00:00.000Z",
            }
        )

        for index, cell_id in enumerate(spec.chain_ids):
            label = normalize_text(str(cells[cell_id]["text"]))
            x = float(cells[cell_id]["x"] or 0)
            y = float(cells[cell_id]["y"] or 0)
            if index == len(spec.chain_ids) - 1:
                collector_positions[spec.report_id] = (x, y)
            else:
                shared_narrator_positions[label].append((x, y))

        text_usage[spec.text_id] += 1
        duplicate_index = text_usage[spec.text_id] - 1
        report_x = float(cells[spec.text_id]["x"] or 0) + spec.x_offset
        report_y = float(cells[spec.text_id]["y"] or 0) + spec.y_offset + duplicate_index * 36
        report_positions[spec.report_id] = (report_x, report_y)
        report_widths[spec.report_id] = float(cells[spec.text_id]["width"] or 260)

    min_x = min(
        [x for positions in shared_narrator_positions.values() for x, _ in positions]
        + [x for x, _ in collector_positions.values()]
        + [x for x, _ in report_positions.values()]
    )
    min_y = min(
        [y for positions in shared_narrator_positions.values() for _, y in positions]
        + [y for _, y in collector_positions.values()]
        + [y for _, y in report_positions.values()]
    )
    x_shift = 120 - min_x
    y_shift = 100 - min_y

    node_positions: dict[str, dict[str, float]] = {}
    for label, positions in shared_narrator_positions.items():
        avg_x = sum(x for x, _ in positions) / len(positions)
        avg_y = sum(y for _, y in positions) / len(positions)
        node_positions[f"n:{label}"] = {
            "x": round(avg_x + x_shift, 2),
            "y": round(avg_y + y_shift, 2),
        }

    for report_id, (x, y) in collector_positions.items():
        node_positions[f"c:{report_id}"] = {
            "x": round(x + x_shift, 2),
            "y": round(y + y_shift, 2),
        }

    node_widths: dict[str, float] = {}
    for report in reports:
        report_id = str(report["id"])
        x, y = report_positions[report_id]
        node_positions[f"m:{report_id}"] = {
            "x": round(x + x_shift, 2),
            "y": round(y + y_shift, 2),
        }
        node_widths[f"m:{report_id}"] = round(report_widths[report_id], 2)

    if existing_bundle:
        node_positions = normalize_legacy_matn_node_ids(dict(existing_bundle.get("nodePositions", {})))
        node_widths = normalize_legacy_matn_node_ids(dict(existing_bundle.get("nodeWidths", {})))

    legend_colors_in_order: list[str] = []
    seen_colors = set()
    for color in used_highlight_colors:
        if color in seen_colors or color not in DRAWIO_HIGHLIGHT_LEGEND:
            continue
        seen_colors.add(color)
        legend_colors_in_order.append(color)

    return {
        "format": "hadith-graph-bundle",
        "version": 1,
        "title": existing_bundle.get("title", "Khosrow Daughter") if existing_bundle else "Khosrow Daughter",
        "createdAt": existing_bundle.get("createdAt", "2026-03-25T00:00:00Z")
        if existing_bundle
        else "2026-03-25T00:00:00Z",
        "updatedAt": current_iso(),
        "reports": reports,
        "highlightLegend": [
            {
                "id": DRAWIO_HIGHLIGHT_LEGEND[color]["id"],
                "label": DRAWIO_HIGHLIGHT_LEGEND[color]["label"],
                "color": color,
            }
            for color in legend_colors_in_order
        ],
        "nodePositions": node_positions,
        "nodeWidths": node_widths,
        "fontSizes": existing_bundle.get(
            "fontSizes",
            {
                "narrator": 13,
                "matn": 12,
            },
        ) if existing_bundle else {
            "narrator": 13,
            "matn": 12,
        },
    }


def main() -> None:
    bundle = build_bundle()
    OUTPUT_PATH.write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH.relative_to(ROOT)} with {len(bundle['reports'])} reports.")


if __name__ == "__main__":
    main()
