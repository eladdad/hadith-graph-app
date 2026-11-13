import unittest

from drawio_graph_conversion.bundle_to_drawio import (
    build_node_specs,
    get_narrator_node_id,
    make_mxfile,
    topological_rows,
)


class CollectorModeConversionTests(unittest.TestCase):
    def setUp(self):
        self.reports = [
            {"id": "first", "isnad": ["Root", "Middle", "Collector"], "matn": "First wording."},
            {"id": "second", "isnad": ["Root", "Middle", "Collector"], "matn": "Second wording."},
        ]

    def convert(self, **overrides):
        nodes, edges = build_node_specs({"reports": self.reports, **overrides})
        return {node.node_id: node for node in nodes}, edges

    def test_existing_bundles_keep_distinct_final_collectors(self):
        nodes, edges = self.convert()
        self.assertEqual(set(nodes), {"n:Root", "n:Middle", "c:first", "c:second", "m:first", "m:second"})
        self.assertEqual(set(edges), {
            ("n:Root", "n:Middle"), ("n:Middle", "c:first"), ("n:Middle", "c:second"),
        })
        self.assertEqual(nodes["c:first"].node_type, "collector")
        self.assertEqual(nodes["m:first"].x, nodes["c:first"].x)
        self.assertEqual(nodes["m:second"].x, nodes["c:second"].x)

    def test_shared_final_narrator_merges_and_anchors_both_matns(self):
        nodes, edges = self.convert(collectorOverrides={"Collector": False})
        self.assertEqual(set(nodes), {"n:Root", "n:Middle", "n:Collector", "m:first", "m:second"})
        self.assertEqual(set(edges), {("n:Root", "n:Middle"), ("n:Middle", "n:Collector")})
        self.assertEqual(nodes["n:Collector"].node_type, "narrator")
        for report in self.reports:
            self.assertEqual(nodes[f'm:{report["id"]}'].x, nodes["n:Collector"].x)

    def test_singleton_authority_stays_shared_across_other_chains(self):
        self.reports[1]["isnad"] = ["Root"]
        nodes, edges = self.convert(nodePositions={"n:Root": {"x": 765, "y": 123}})
        self.assertEqual(set(nodes), {"n:Root", "n:Middle", "c:first", "m:first", "m:second"})
        self.assertEqual(nodes["n:Root"].node_type, "narrator")
        self.assertEqual((nodes["n:Root"].x, nodes["n:Root"].y), (765, 123))
        self.assertEqual(nodes["m:second"].x, 765)
        self.assertEqual(set(edges), {("n:Root", "n:Middle"), ("n:Middle", "c:first")})
        self.assertEqual(get_narrator_node_id(self.reports[1], 0), "n:Root")
        self.assertEqual({node for row in topological_rows(self.reports) for node in row},
                         {"n:Root", "n:Middle", "c:first"})

    def test_singleton_can_be_explicitly_designated_as_collector(self):
        self.reports[1]["isnad"] = ["Root"]
        nodes, edges = self.convert(collectorOverrides={"Root": True})
        split_root = "cn:%5B%22first%22%2C0%5D"
        self.assertIn(split_root, nodes)
        self.assertIn("c:second", nodes)
        self.assertNotIn("n:Root", nodes)
        self.assertEqual(nodes["c:second"].node_type, "collector")
        self.assertIn((split_root, "n:Middle"), edges)
        self.assertEqual(nodes["m:second"].x, nodes["c:second"].x)

    def test_intermediate_collectors_have_matching_ids_edges_positions_and_topology(self):
        collectors = {"Middle"}
        first_middle = get_narrator_node_id(self.reports[0], 1, collectors)
        second_middle = get_narrator_node_id(self.reports[1], 1, collectors)
        saved = {first_middle: {"x": 765, "y": 432}}
        nodes, edges = self.convert(
            collectorOverrides={"Middle": True, "Collector": False}, nodePositions=saved,
        )
        self.assertEqual(first_middle, "cn:%5B%22first%22%2C1%5D")
        self.assertNotEqual(first_middle, second_middle)
        self.assertEqual(len(nodes), 6)
        self.assertEqual(set(edges), {
            ("n:Root", first_middle), (first_middle, "n:Collector"),
            ("n:Root", second_middle), (second_middle, "n:Collector"),
        })
        self.assertEqual((nodes[first_middle].x, nodes[first_middle].y), (765, 432))
        self.assertEqual(nodes[first_middle].node_type, "collector")
        self.assertEqual({node for row in topological_rows(self.reports, collectors) for node in row},
                         {"n:Root", first_middle, second_middle, "n:Collector"})
        xml = make_mxfile({"reports": self.reports, "collectorOverrides": {"Middle": True, "Collector": False}})
        self.assertEqual({(edge.get("source"), edge.get("target")) for edge in xml.findall('.//mxCell[@edge="1"]')},
                         set(edges))

    def test_terminal_defaults_apply_to_same_narrator_inside_another_chain(self):
        self.reports[1]["isnad"] = ["Root", "Middle"]
        nodes, edges = self.convert()
        middle = "cn:%5B%22first%22%2C1%5D"
        self.assertIn(middle, nodes)
        self.assertNotIn("n:Middle", nodes)
        self.assertIn(("n:Root", middle), edges)
        self.assertIn(("n:Root", "c:second"), edges)
        self.assertEqual(nodes["m:second"].x, nodes["c:second"].x)

    def test_unicode_and_reserved_report_ids_match_javascript_encoding(self):
        report = {"id": "ر:!~()", "isnad": ["Root", "Middle", "Collector"]}
        self.assertEqual(get_narrator_node_id(report, 1, {"Middle"}),
                         "cn:%5B%22%D8%B1%3A!~()%22%2C1%5D")

    def test_legacy_saved_collector_and_matn_keys_still_apply(self):
        nodes, _ = self.convert(
            collectorOverrides={"Middle": True},
            nodePositions={
                "n:Middle": {"x": 555, "y": 222},
                "n:Collector": {"x": 888, "y": 333},
                "r:first": {"x": 999, "y": 444},
            },
            nodeWidths={"r:first": 456},
        )
        self.assertEqual((nodes["cn:%5B%22first%22%2C1%5D"].x, nodes["cn:%5B%22first%22%2C1%5D"].y), (555, 222))
        self.assertEqual((nodes["c:second"].x, nodes["c:second"].y), (888, 333))
        self.assertEqual(nodes["m:second"].x, 888)
        self.assertEqual((nodes["m:first"].x, nodes["m:first"].y, nodes["m:first"].width), (999, 444, 456))

    def test_invalid_collector_values_are_rejected(self):
        for overrides in [None, [], {"Collector": "false"}, {"Collector": 0}, {" ": True}]:
            with self.subTest(overrides=overrides), self.assertRaises(ValueError):
                self.convert(collectorOverrides=overrides)


if __name__ == "__main__":
    unittest.main()
