"""Convert the supplied explorer's embedded JSON; never execute its scripts."""

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import re


def unique(values):
    return list(dict.fromkeys(value for value in values if value))


def source_notes(record):
    lines = [
        "Source links:",
        *unique(record.get("urls", []) + [record.get("url")]),
    ]
    seen = set()
    for key, label in [
        ("source_isnad_ar", "Source isnad wording"),
        ("source_full_ar", "Full source text"),
        ("full_record_ar", "Full record"),
    ]:
        value = record.get(key)
        if value and value not in seen:
            lines.extend(["", label + " as supplied in the HTML:", value])
            seen.add(value)
    return lines


def convert(source, output_dir):
    html = source.read_text(encoding="utf-8")
    match = re.search(r'<script\b[^>]*\bid="corpus-data"[^>]*>(.*?)</script>', html, re.S)
    if not match:
        raise ValueError("No embedded corpus-data JSON found")
    corpus = json.loads(match[1])
    timestamp = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    names = {}
    for witness in corpus["witnesses"]:
        for path in witness["narrator_chains"]:
            for narrator in path:
                previous = names.setdefault(narrator["id"], narrator["name_ar"])
                assert previous == narrator["name_ar"], "Inconsistent narrator identity label"
    assert len(set(names.values())) == len(names), "Distinct narrator identities share a name"
    edges = {(edge["source"], edge["target"]): edge for edge in corpus["graph"]["edges"]}
    reports = []
    manifest = []
    qualified_witnesses = set()
    extra_routes = []
    for witness in corpus["witnesses"]:
        wid = witness["id"]
        paths = witness["narrator_chains"]
        assert len(paths) == len(witness["graph_paths"])
        for route_number, path in enumerate(paths, 1):
            canonical_ids = [narrator["id"] for narrator in path]
            graph_path = canonical_ids + [f"C_{wid}", f"M_{wid}"]
            assert graph_path == witness["graph_paths"][route_number - 1]
            matches = [branch for branch in witness["branch_details"] if branch["chain"] == canonical_ids]
            assert len(matches) <= 1
            branch = matches[0] if matches else None
            branch_id = branch["id"] if branch else f"{witness['branch_details'][0]['id']}-route-{route_number}"
            if not branch:
                extra_routes.append({"witness": wid, "route": route_number, "reportId": f"moon-split-{branch_id}"})
            qualifiers = []
            for source_id, target_id in zip(graph_path, graph_path[1:]):
                edge = edges[(source_id, target_id)]
                for note in edge.get("notes", []):
                    if note["witness"] == wid:
                        qualifiers.append(f"{source_id} → {target_id}: {note['text']}")
            for note in witness.get("link_notes", []):
                qualifier = f"{note['source']} → {note['target']}: {note['text']}"
                qualifiers.append(qualifier)
            qualifiers = unique(qualifiers)
            notes = [
                "Extracted from the supplied moon_split_explorer.html; external sources were not re-verified for this conversion.",
                f"HTML witness: {wid}; branch: {branch_id}; route: {route_number}/{len(paths)}",
                f"Authority/family as supplied: {witness['companion']}",
                f"Source: {witness['collection']} — {branch['reference'] if branch else witness['reference']}",
                f"Source record: {witness['source_record']}",
                f"Report kind: {witness['kind']}",
                f"Source status as supplied: {witness.get('source_status', witness.get('status', ''))}",
                "",
                "Route order: earliest named narrator → compiler. Compiler label appended from the HTML metadata.",
                "Canonical narrator IDs: " + " → ".join(canonical_ids),
            ]
            if len(paths) > 1:
                notes.extend([
                    "",
                    f"FORMAT CONVERSION: Route {route_number} of {len(paths)} in the single text witness {wid}.",
                    "Version 1 supports one chain per report, so each supplied route has its own entry with the same source matn.",
                    "The repeated matn is shared source wording, not an independent wording attestation for each chain. Alternatives introduced by 'or' remain alternatives within this source.",
                ])
            if not branch:
                notes.append("This additional route is explicitly present in narrator_chains and graph_paths but lacks its own branch_details entry. The route suffix is a conversion identifier, not an added chain.")
            if qualifiers:
                qualified_witnesses.add(wid)
                notes.extend([
                    "", "QUALIFIED LINKS — copied from the HTML:",
                    *qualifiers,
                    "Version 1 cannot display dashed/uncertain edges. The displayed links retain the source's stated route; they do not establish direct hearing or fill missing transmitters.",
                ])
            copied_notes = unique(witness.get("notes", []) + (branch.get("notes", []) if branch else []))
            notes.extend(["", "Notes copied from the HTML:", *copied_notes, "", *source_notes(witness)])
            represented_fields = {
                "companion", "collection", "compiler", "reference", "source_record", "url", "urls",
                "chain", "chains", "matn_ar", "source_full_ar", "source_isnad_ar", "notes", "status",
                "type", "compiler_ar", "kind", "family", "link_notes", "full_record_ar", "source_status",
                "branch_ids", "branch_details", "id", "ref", "family_label", "narrator_chains", "graph_paths",
            }
            additional = {key: value for key, value in witness.items() if key not in represented_fields}
            if additional:
                notes.extend(["", "Additional source metadata copied from the HTML:", json.dumps(additional, ensure_ascii=False, indent=2)])
            report = {
                "id": f"moon-split-{branch_id}",
                "isnad": [narrator["name_ar"] for narrator in path] + [witness["compiler_ar"]],
                "matn": witness["matn_ar"],
                "matnHighlights": [],
                "note": "\n".join(notes),
                "createdAt": timestamp,
            }
            reports.append(report)
            manifest.append({"number": len(reports), "reportId": report["id"], "witness": wid, "route": route_number, "sourceRecord": witness["source_record"]})
    path_count = len(reports)
    appendix_count = 0
    for record in corpus["appendix"]:
        if not record.get("matn_ar"):
            continue
        assert record.get("authority") and record.get("id_temp")
        notes = [
            "HTML APPENDIX — no usable complete transmission chain supplied.",
            f"Appendix record: {record['id_temp']}",
            f"Authority/source label as supplied: {record['authority']}",
            f"Source: {record['collection']} — {record['reference']}",
            f"Report kind: {record['kind']}",
            "FORMAT CONVERSION: This text is represented by one isolated authority/source label and its matn. No transmission edges or missing narrators have been inferred. The displayed label may itself be qualified or uncertain.",
            "External sources were not re-verified for this conversion.",
            "", "Notes copied from the HTML:", *record.get("notes", []),
        ]
        if record.get("partial_chain"):
            notes.extend(["", "Partial route supplied in the appendix (not a complete recovered chain):", json.dumps(record["partial_chain"], ensure_ascii=False)])
        notes.extend(["", *source_notes(record)])
        report = {
            "id": "moon-split-appendix-" + record["id_temp"],
            "isnad": [record["authority"]],
            "matn": record["matn_ar"],
            "matnHighlights": [],
            "note": "\n".join(notes),
            "createdAt": timestamp,
        }
        reports.append(report)
        appendix_count += 1
        manifest.append({"number": len(reports), "reportId": report["id"], "appendixRecord": record["id_temp"]})
    assert len({report["id"] for report in reports}) == len(reports)
    assert path_count == corpus["metadata"]["named_paths"]
    bundle = {
        "format": "hadith-graph-bundle", "version": 1,
        "title": f"Moon splitting — full HTML corpus ({len(corpus['witnesses'])} witnesses, {path_count} chains, {appendix_count} appendix texts)",
        "createdAt": timestamp, "updatedAt": timestamp,
        "reports": reports, "highlightLegend": [], "nodePositions": {}, "nodeWidths": {},
        "fontSizes": {"narrator": 13, "matn": 14},
    }
    provenance = {
        "sourceFile": source.name,
        "sourceMetadata": corpus["metadata"],
        "summary": {
            "graphedWitnesses": len(corpus["witnesses"]), "chainEntries": path_count,
            "appendixTextEntries": appendix_count, "totalImportEntries": len(reports),
            "sourceRecords": len({w['source_record'] for w in corpus['witnesses']}),
            "qualifiedLinkWitnesses": sorted(qualified_witnesses), "extraRoutesWithoutBranchDetails": extra_routes,
            "witnessesByKind": dict(Counter(w['kind'] for w in corpus['witnesses'])),
        },
        "reportIndex": manifest,
        "witnesses": corpus["witnesses"],
        "appendix": corpus["appendix"],
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    for filename, content in [
        ("moon-splitting-full.hadith-graph.json", bundle),
        ("moon-splitting-full-source-notes.json", provenance),
    ]:
        destination = output_dir / filename
        destination.write_text(json.dumps(content, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(destination)
    print(json.dumps(provenance["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("html", type=Path)
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parents[1] / "examples")
    args = parser.parse_args()
    convert(args.html, args.output_dir)
