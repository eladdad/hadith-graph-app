from __future__ import annotations

import argparse
import json
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from html import escape
from pathlib import Path


NARRATOR_PREFIX = "n:"
COLLECTOR_PREFIX = "c:"
MATN_PREFIX = "m:"

DEFAULT_NARRATOR_FONT_SIZE = 13
DEFAULT_MATN_FONT_SIZE = 12
DEFAULT_MATN_WIDTH = 360.0
DEFAULT_NARRATOR_WIDTH = 190.0
DEFAULT_NARRATOR_HEIGHT = 56.0
DEFAULT_MATN_MIN_HEIGHT = 60.0

AUTO_START_X = 120.0
AUTO_START_Y = 100.0
AUTO_HORIZONTAL_GAP = 80.0
AUTO_VERTICAL_GAP = 120.0
AUTO_MATN_GAP = 180.0

EDGE_STYLE = (
    "edgeStyle=orthogonalEdgeStyle;"
    "rounded=0;"
    "orthogonalLoop=1;"
    "jettySize=auto;"
    "html=1;"
    "exitX=0.5;"
    "exitY=1;"
    "exitDx=0;"
    "exitDy=0;"
    "entryX=0.5;"
    "entryY=0;"
    "entryDx=0;"
    "entryDy=0;"
)


@dataclass(frozen=True)
class FontSizes:
    narrator: int
    matn: int


@dataclass
class NodeSpec:
    node_id: str
    label: str
    node_type: str
    x: float
    y: float
    width: float
    height: float
    value: str


def get_shared_narrator_node_id(name: str) -> str:
    return f"{NARRATOR_PREFIX}{name}"


def get_collector_node_id(report_id: str) -> str:
    return f"{COLLECTOR_PREFIX}{report_id}"


def get_matn_node_id(report_id: str) -> str:
    return f"{MATN_PREFIX}{report_id}"


def get_narrator_node_id(report: dict[str, object], narrator_index: int) -> str:
    isnad = report.get("isnad", [])
    if not isinstance(isnad, list):
        return get_collector_node_id(str(report.get("id", "")))

    narrator_name = str(isnad[narrator_index]) if narrator_index < len(isnad) else ""
    if narrator_index == len(isnad) - 1:
        return get_collector_node_id(str(report.get("id", "")))
    return get_shared_narrator_node_id(narrator_name)


def clamp_font_size(value: object, fallback: int) -> int:
    if isinstance(value, (int, float)) and value == value:
        return max(10, min(24, round(float(value))))
    return fallback


def parse_font_sizes(bundle: dict[str, object]) -> FontSizes:
    raw = bundle.get("fontSizes")
    if isinstance(raw, dict):
        return FontSizes(
            narrator=clamp_font_size(raw.get("narrator"), DEFAULT_NARRATOR_FONT_SIZE),
            matn=clamp_font_size(raw.get("matn"), DEFAULT_MATN_FONT_SIZE),
        )
    return FontSizes(DEFAULT_NARRATOR_FONT_SIZE, DEFAULT_MATN_FONT_SIZE)


def parse_highlight_legend(bundle: dict[str, object]) -> dict[str, str]:
    legend_by_id: dict[str, str] = {}
    raw = bundle.get("highlightLegend", [])
    if not isinstance(raw, list):
        return legend_by_id

    for entry in raw:
        if not isinstance(entry, dict):
            continue
        legend_id = entry.get("id")
        color = entry.get("color")
        if isinstance(legend_id, str) and isinstance(color, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", color):
            legend_by_id[legend_id] = color.lower()

    return legend_by_id


def parse_node_positions(bundle: dict[str, object]) -> dict[str, tuple[float, float]]:
    positions: dict[str, tuple[float, float]] = {}
    raw = bundle.get("nodePositions", {})
    if not isinstance(raw, dict):
        return positions

    for node_id, value in raw.items():
        if not isinstance(node_id, str) or not isinstance(value, dict):
            continue
        x = value.get("x")
        y = value.get("y")
        if isinstance(x, (int, float)) and isinstance(y, (int, float)):
            positions[node_id] = (float(x), float(y))

    return positions


def parse_node_widths(bundle: dict[str, object]) -> dict[str, float]:
    widths: dict[str, float] = {}
    raw = bundle.get("nodeWidths", {})
    if not isinstance(raw, dict):
        return widths

    for node_id, value in raw.items():
        if isinstance(node_id, str) and isinstance(value, (int, float)):
            widths[node_id] = max(120.0, float(value))

    return widths


def strip_prefix(value: str, prefix: str) -> str:
    return value[len(prefix):] if value.startswith(prefix) else value


def topological_rows(reports: list[dict[str, object]]) -> list[list[str]]:
    labels_by_id: dict[str, str] = {}
    adjacency: dict[str, set[str]] = {}
    indegree: dict[str, int] = {}

    def ensure_node(node_id: str, label: str) -> None:
        labels_by_id.setdefault(node_id, label)
        adjacency.setdefault(node_id, set())
        indegree.setdefault(node_id, 0)

    def add_edge(source: str, target: str) -> None:
        ensure_node(source, labels_by_id.get(source, source))
        ensure_node(target, labels_by_id.get(target, target))
        if target in adjacency[source]:
            return
        adjacency[source].add(target)
        indegree[target] = indegree.get(target, 0) + 1

    for report in reports:
        report_id = str(report.get("id", ""))
        isnad = report.get("isnad", [])
        if not isinstance(isnad, list):
            continue

        for narrator_index, narrator_name in enumerate(isnad):
            label = str(narrator_name)
            node_id = (
                get_collector_node_id(report_id)
                if narrator_index == len(isnad) - 1
                else get_shared_narrator_node_id(label)
            )
            ensure_node(node_id, label)

        for narrator_index in range(len(isnad) - 1):
            source = get_narrator_node_id(report, narrator_index)
            target = get_narrator_node_id(report, narrator_index + 1)
            add_edge(source, target)

    queue = sorted(
        [node_id for node_id, count in indegree.items() if count == 0],
        key=lambda node_id: labels_by_id.get(node_id, node_id),
    )
    order: list[str] = []
    depth: dict[str, int] = {node_id: 0 for node_id in indegree}
    indegree_copy = dict(indegree)

    while queue:
        current = queue.pop(0)
        order.append(current)
        for neighbor in sorted(adjacency.get(current, set()), key=lambda node_id: labels_by_id.get(node_id, node_id)):
            depth[neighbor] = max(depth.get(neighbor, 0), depth.get(current, 0) + 1)
            indegree_copy[neighbor] -= 1
            if indegree_copy[neighbor] == 0:
                queue.append(neighbor)
                queue.sort(key=lambda node_id: labels_by_id.get(node_id, node_id))

    remaining = [node_id for node_id in indegree if node_id not in order]
    for node_id in sorted(remaining, key=lambda value: labels_by_id.get(value, value)):
        order.append(node_id)
        depth.setdefault(node_id, 0)

    rows_by_depth: dict[int, list[str]] = {}
    for node_id in order:
        row_depth = depth.get(node_id, 0)
        rows_by_depth.setdefault(row_depth, []).append(node_id)

    rows: list[list[str]] = []
    for row_depth in sorted(rows_by_depth):
        rows.append(sorted(rows_by_depth[row_depth], key=lambda node_id: labels_by_id.get(node_id, node_id)))
    return rows


def estimate_matn_height(text: str, width: float, font_size: int) -> float:
    usable_width = max(width - 28.0, 80.0)
    approx_chars_per_line = max(int(usable_width / max(font_size * 0.65, 1.0)), 10)
    line_count = 0

    for raw_line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if raw_line.strip() == "":
            line_count += 1
            continue

        words = raw_line.split()
        current_length = 0
        for word in words:
            extra = len(word) if current_length == 0 else len(word) + 1
            if current_length > 0 and current_length + extra > approx_chars_per_line:
                line_count += 1
                current_length = len(word)
            else:
                current_length += extra
        line_count += 1

    line_height = font_size + 4
    return max(DEFAULT_MATN_MIN_HEIGHT, 28.0 + line_count * line_height)


def to_drawio_font_style(hex_color: str) -> str:
    red = int(hex_color[1:3], 16)
    green = int(hex_color[3:5], 16)
    blue = int(hex_color[5:7], 16)
    return f"color: light-dark(rgb(0, 0, 0), rgb({red}, {green}, {blue}));"


def render_matn_html(text: str, highlights: list[dict[str, object]], legend_by_id: dict[str, str]) -> str:
    normalized_text = text.replace("\r\n", "\n").replace("\r", "\n")
    char_colors: list[str | None] = [None] * len(normalized_text)

    sanitized_highlights: list[tuple[int, int, str]] = []
    for item in highlights:
        if not isinstance(item, dict):
            continue
        start = item.get("start")
        end = item.get("end")
        legend_id = item.get("legendId")
        if not isinstance(start, int) or not isinstance(end, int) or not isinstance(legend_id, str):
            continue
        color = legend_by_id.get(legend_id)
        if not color:
            continue
        clamped_start = max(0, min(start, len(normalized_text)))
        clamped_end = max(clamped_start, min(end, len(normalized_text)))
        if clamped_start >= clamped_end:
            continue
        sanitized_highlights.append((clamped_start, clamped_end, color))

    sanitized_highlights.sort(key=lambda item: (item[0], item[1], item[2]))
    last_end = 0
    for start, end, color in sanitized_highlights:
        if start < last_end:
            continue
        for index in range(start, end):
            char_colors[index] = color
        last_end = end

    lines: list[list[tuple[str, str | None]]] = [[]]
    current_text = ""
    current_color: str | None = None

    def push_segment() -> None:
        nonlocal current_text, current_color
        if current_text == "":
            return
        lines[-1].append((current_text, current_color))
        current_text = ""

    for char, color in zip(normalized_text, char_colors):
        if char == "\n":
            push_segment()
            lines.append([])
            current_color = None
            continue
        if color != current_color:
            push_segment()
            current_color = color
        current_text += char
    push_segment()

    html_lines: list[str] = []
    for line in lines:
        if not line:
            html_lines.append("<div><br></div>")
            continue
        rendered_segments: list[str] = []
        for segment_text, color in line:
            escaped_text = escape(segment_text)
            if color is None:
                rendered_segments.append(escaped_text)
            else:
                rendered_segments.append(
                    f'<font style="{to_drawio_font_style(color)}">{escaped_text}</font>'
                )
        html_lines.append(f"<div>{''.join(rendered_segments)}</div>")

    return "".join(html_lines)


def narrator_style(font_size: int) -> str:
    return f"whiteSpace=wrap;html=1;fontSize={font_size};"


def collector_style(font_size: int) -> str:
    return (
        f"whiteSpace=wrap;html=1;fontSize={font_size};"
        "fillColor=#0050ef;"
        "fontColor=#ffffff;"
        "strokeColor=#001DBC;"
    )


def matn_style(font_size: int) -> str:
    return f"whiteSpace=wrap;html=1;fontSize={font_size};strokeColor=none;align=right;fillColor=none;"


def build_node_specs(bundle: dict[str, object]) -> tuple[list[NodeSpec], list[tuple[str, str]]]:
    raw_reports = bundle.get("reports", [])
    if not isinstance(raw_reports, list):
        raise ValueError('Bundle field "reports" must be an array.')

    reports = [report for report in raw_reports if isinstance(report, dict)]
    font_sizes = parse_font_sizes(bundle)
    legend_by_id = parse_highlight_legend(bundle)
    saved_positions = parse_node_positions(bundle)
    saved_widths = parse_node_widths(bundle)

    auto_positions: dict[str, tuple[float, float]] = {}
    rows = topological_rows(reports)
    for row_index, row_node_ids in enumerate(rows):
        x_cursor = AUTO_START_X
        y_value = AUTO_START_Y + row_index * (DEFAULT_NARRATOR_HEIGHT + AUTO_VERTICAL_GAP)
        for node_id in row_node_ids:
            auto_positions[node_id] = (x_cursor, y_value)
            x_cursor += DEFAULT_NARRATOR_WIDTH + AUTO_HORIZONTAL_GAP

    narrator_bottom = 0.0
    for node_id, (_, y_value) in auto_positions.items():
        if node_id.startswith(MATN_PREFIX):
            continue
        narrator_bottom = max(narrator_bottom, y_value + DEFAULT_NARRATOR_HEIGHT)

    node_specs: dict[str, NodeSpec] = {}
    edges: list[tuple[str, str]] = []

    def position_for(node_id: str) -> tuple[float, float]:
        return saved_positions.get(node_id) or auto_positions.get(node_id) or (AUTO_START_X, AUTO_START_Y)

    def add_narrator_node(node_id: str, label: str, is_collector: bool) -> None:
        if node_id in node_specs:
            return
        x_value, y_value = position_for(node_id)
        node_specs[node_id] = NodeSpec(
            node_id=node_id,
            label=label,
            node_type="collector" if is_collector else "narrator",
            x=x_value,
            y=y_value,
            width=DEFAULT_NARRATOR_WIDTH,
            height=DEFAULT_NARRATOR_HEIGHT,
            value=label,
        )

    for report_index, report in enumerate(reports):
        report_id = str(report.get("id", f"report-{report_index + 1}"))
        isnad = report.get("isnad", [])
        if not isinstance(isnad, list):
            continue

        for narrator_index, narrator_name in enumerate(isnad):
            label = str(narrator_name)
            node_id = (
                get_collector_node_id(report_id)
                if narrator_index == len(isnad) - 1
                else get_shared_narrator_node_id(label)
            )
            add_narrator_node(node_id, label, narrator_index == len(isnad) - 1)

        for narrator_index in range(len(isnad) - 1):
            source = get_narrator_node_id(report, narrator_index)
            target = get_narrator_node_id(report, narrator_index + 1)
            edge = (source, target)
            if edge not in edges:
                edges.append(edge)

        matn = str(report.get("matn", ""))
        matn_highlights = report.get("matnHighlights", [])
        if not isinstance(matn_highlights, list):
            matn_highlights = []

        matn_node_id = get_matn_node_id(report_id)
        if matn_node_id in saved_positions:
            matn_x, matn_y = saved_positions[matn_node_id]
        else:
            anchor_id = get_collector_node_id(report_id)
            anchor_x, _ = position_for(anchor_id)
            matn_x = anchor_x
            matn_y = narrator_bottom + AUTO_MATN_GAP

        matn_width = saved_widths.get(matn_node_id, DEFAULT_MATN_WIDTH)
        matn_height = estimate_matn_height(matn, matn_width, font_sizes.matn)
        node_specs[matn_node_id] = NodeSpec(
            node_id=matn_node_id,
            label=f"Matn {report_index + 1}",
            node_type="matn",
            x=matn_x,
            y=matn_y,
            width=matn_width,
            height=matn_height,
            value=render_matn_html(matn, matn_highlights, legend_by_id),
        )

    return list(node_specs.values()), edges


def make_mxfile(bundle: dict[str, object]) -> ET.Element:
    node_specs, edges = build_node_specs(bundle)
    font_sizes = parse_font_sizes(bundle)

    max_x = max((node.x + node.width for node in node_specs), default=850.0)
    max_y = max((node.y + node.height for node in node_specs), default=1100.0)

    mxfile = ET.Element(
        "mxfile",
        {
            "host": "app.diagrams.net",
            "agent": "bundle_to_drawio.py",
            "version": "29.6.6",
        },
    )
    diagram = ET.SubElement(
        mxfile,
        "diagram",
        {
            "name": "Page-1",
            "id": "bundle-to-drawio",
        },
    )
    model = ET.SubElement(
        diagram,
        "mxGraphModel",
        {
            "grid": "1",
            "page": "1",
            "gridSize": "10",
            "guides": "1",
            "tooltips": "1",
            "connect": "1",
            "arrows": "1",
            "fold": "1",
            "pageScale": "1",
            "pageWidth": str(max(850, int(max_x + 120))),
            "pageHeight": str(max(1100, int(max_y + 120))),
            "math": "0",
            "shadow": "0",
        },
    )
    root = ET.SubElement(model, "root")
    ET.SubElement(root, "mxCell", {"id": "0"})
    ET.SubElement(root, "mxCell", {"id": "1", "parent": "0"})

    for node in node_specs:
        if node.node_type == "collector":
            style = collector_style(font_sizes.narrator)
        elif node.node_type == "matn":
            style = matn_style(font_sizes.matn)
        else:
            style = narrator_style(font_sizes.narrator)

        cell = ET.SubElement(
            root,
            "mxCell",
            {
                "id": node.node_id,
                "parent": "1",
                "style": style,
                "value": node.value,
                "vertex": "1",
            },
        )
        ET.SubElement(
            cell,
            "mxGeometry",
            {
                "x": f"{node.x:.2f}".rstrip("0").rstrip("."),
                "y": f"{node.y:.2f}".rstrip("0").rstrip("."),
                "width": f"{node.width:.2f}".rstrip("0").rstrip("."),
                "height": f"{node.height:.2f}".rstrip("0").rstrip("."),
                "as": "geometry",
            },
        )

    for edge_index, (source, target) in enumerate(edges, start=1):
        cell = ET.SubElement(
            root,
            "mxCell",
            {
                "id": f"edge-{edge_index}",
                "edge": "1",
                "parent": "1",
                "source": source,
                "target": target,
                "style": EDGE_STYLE,
            },
        )
        ET.SubElement(cell, "mxGeometry", {"relative": "1", "as": "geometry"})

    return mxfile


def convert_bundle_to_drawio(bundle_path: Path, output_path: Path) -> None:
    bundle = json.loads(bundle_path.read_text(encoding="utf-8"))
    if not isinstance(bundle, dict):
        raise ValueError("Bundle JSON must be an object.")
    if bundle.get("format") != "hadith-graph-bundle":
        raise ValueError('Bundle format must be "hadith-graph-bundle".')

    mxfile = make_mxfile(bundle)
    ET.indent(mxfile, space="  ")
    output_path.write_text(ET.tostring(mxfile, encoding="unicode") + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert a hadith-graph bundle JSON file into a draw.io graph.")
    parser.add_argument("bundle", type=Path, help="Path to the input bundle JSON file.")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Path to the output .drawio file. Defaults to the input path with a .drawio suffix.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    bundle_path = args.bundle.resolve()
    output_path = args.output.resolve() if args.output else bundle_path.with_suffix(".drawio")
    convert_bundle_to_drawio(bundle_path, output_path)
    print(f"Wrote {output_path}")


if __name__ == "__main__":
    main()
