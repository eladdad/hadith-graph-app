import { describe, expect, it } from 'vitest';
import {
  addReportToBundleFromFields,
  bundleToJson,
  createEmptyBundle,
  deleteReportFromBundle,
  getEdgeIdsForReport,
  getNodeIdsForReport,
  parseBundleJson,
  updateReportInBundle,
} from '../src/bundle';
import { getNarratorNodeIdForReport } from '../src/graph';
import { makeBundle, makeReport } from './helpers';

function prefix(...narrators: string[]): string {
  return `t:${encodeURIComponent(JSON.stringify(narrators))}`;
}

const first = makeReport('r1', ['Root', 'Shared', 'Collector'], 'First wording.');
const second = makeReport('r2', ['Root', 'Shared', 'Collector'], 'Second wording.');

describe('bundle support for merged and trie representations', () => {
  it('keeps version-one bundles and default merged IDs compatible when no trie positions are present', () => {
    const bundle = makeBundle([first, second], {
      nodePositions: {
        'n:Root': { x: 100, y: 120 },
        'c:r1': { x: 300, y: 500 },
        'c:r2': { x: 700, y: 500 },
        'm:r1': { x: 350, y: 800 },
      },
    });
    expect(createEmptyBundle().trieNodePositions).toBeUndefined();
    expect(bundleToJson(bundle)).not.toContain('trieNodePositions');
    const restored = parseBundleJson(bundleToJson(bundle)).bundle!;

    expect(restored.version).toBe(1);
    expect(restored.trieNodePositions).toBeUndefined();
    expect(restored.nodePositions).toEqual(bundle.nodePositions);
    expect(restored.reports).toEqual(bundle.reports);
    expect(getNodeIdsForReport(first)).toEqual(['m:r1', 'n:Root', 'n:Shared', 'c:r1']);
    expect(getNodeIdsForReport(first, 'merged')).toEqual(getNodeIdsForReport(first));
    expect(getEdgeIdsForReport(first)).toEqual(['n:Root->n:Shared', 'n:Shared->c:r1']);
    expect(getEdgeIdsForReport(first, 'merged')).toEqual(getEdgeIdsForReport(first));
    expect(getNarratorNodeIdForReport(first, 2)).toBe('c:r1');
    expect(getNarratorNodeIdForReport(second, 2)).toBe('c:r2');

    const added = addReportToBundleFromFields(restored, ['Root', 'Other collector'], 'Added wording.');
    expect(added.error).toBeUndefined();
    expect(added.bundle!.trieNodePositions).toBeUndefined();
  });

  it('uses shared prefix IDs through the terminal narrator in trie mode while keeping separate matn IDs', () => {
    const root = prefix('Root');
    const shared = prefix('Root', 'Shared');
    const terminal = prefix('Root', 'Shared', 'Collector');

    expect(getNodeIdsForReport(first, 'trie')).toEqual(['m:r1', root, shared, terminal]);
    expect(getNodeIdsForReport(second, 'trie')).toEqual(['m:r2', root, shared, terminal]);
    expect(getEdgeIdsForReport(first, 'trie')).toEqual([`${root}->${shared}`, `${shared}->${terminal}`]);
    expect(getEdgeIdsForReport(second, 'trie')).toEqual(getEdgeIdsForReport(first, 'trie'));
    expect(getNarratorNodeIdForReport(first, 2, 'trie')).toBe(terminal);
    expect(getNarratorNodeIdForReport(second, 2, 'trie')).toBe(terminal);
    expect(getNodeIdsForReport(first)).not.toContain(terminal);
  });

  it('roundtrips independent position maps without mixing shared matn IDs or changing report data and widths', () => {
    const bundle = makeBundle([first, second], {
      nodePositions: {
        'n:Root': { x: 100, y: 120 },
        'c:r1': { x: 300, y: 500 },
        'm:r1': { x: 350, y: 800 },
      },
      trieNodePositions: {
        [prefix('Root')]: { x: 1100, y: 220 },
        [prefix('Root', 'Shared', 'Collector')]: { x: 1300, y: 600 },
        'm:r1': { x: 1350, y: 900 },
      },
      nodeWidths: { 'm:r1': 440, 'm:r2': 220 },
    });
    const restored = parseBundleJson(bundleToJson(bundle));

    expect(restored.error).toBeUndefined();
    expect(restored.bundle!.version).toBe(1);
    expect(restored.bundle!.reports).toEqual(bundle.reports);
    expect(restored.bundle!.nodePositions).toEqual(bundle.nodePositions);
    expect(restored.bundle!.trieNodePositions).toEqual(bundle.trieNodePositions);
    expect(restored.bundle!.nodeWidths).toEqual(bundle.nodeWidths);
    restored.bundle!.trieNodePositions!['m:r1'].x = 1700;
    expect(restored.bundle!.nodePositions['m:r1']).toEqual({ x: 350, y: 800 });
    expect(bundle.trieNodePositions!['m:r1']).toEqual({ x: 1350, y: 900 });
  });

  it.each(['legacy-first', 'current-first'])('normalizes each map independently with current-ID precedence (%s)', (order) => {
    const mergedLegacy = ['r:r1', { x: 100, y: 200 }] as const;
    const mergedCurrent = ['m:r1', { x: 300, y: 400 }] as const;
    const trieLegacy = ['r:r1', { x: 1100, y: 1200 }] as const;
    const trieCurrent = ['m:r1', { x: 1300, y: 1400 }] as const;
    const bundle = makeBundle([first, second], {
      nodePositions: Object.fromEntries([
        ...(order === 'legacy-first' ? [mergedLegacy, mergedCurrent] : [mergedCurrent, mergedLegacy]),
        ['r:r2', { x: 500, y: 600 }],
      ]),
      trieNodePositions: Object.fromEntries([
        ...(order === 'legacy-first' ? [trieLegacy, trieCurrent] : [trieCurrent, trieLegacy]),
        ['r:r2', { x: 1500, y: 1600 }],
        [prefix('Root'), { x: 1700, y: 1800 }],
      ]),
    });
    const restored = parseBundleJson(bundleToJson(bundle)).bundle!;

    expect(restored.nodePositions).toEqual({
      'm:r1': { x: 300, y: 400 },
      'm:r2': { x: 500, y: 600 },
    });
    expect(restored.trieNodePositions).toEqual({
      'm:r1': { x: 1300, y: 1400 },
      'm:r2': { x: 1500, y: 1600 },
      [prefix('Root')]: { x: 1700, y: 1800 },
    });
    expect(restored.nodePositions).not.toHaveProperty('r:r1');
    expect(restored.trieNodePositions).not.toHaveProperty('r:r1');
  });

  it.each([
    null,
    'not a map',
    42,
    { [prefix('Root')]: null },
    { [prefix('Root')]: { x: '100', y: 200 } },
    { [prefix('Root')]: { x: 100, y: '200' } },
    { [prefix('Root')]: { x: 100 } },
    { [prefix('Root')]: { x: null, y: 200 } },
  ])('rejects invalid trie position data: %j', (positions) => {
    const raw = { ...makeBundle([first]), trieNodePositions: positions };
    const parsed = parseBundleJson(JSON.stringify(raw));
    expect(parsed.bundle).toBeUndefined();
    expect(parsed.error).toBeTruthy();
  });

  it.each(['nodePositions', 'trieNodePositions'])('rejects array-shaped maps in %s', (field) => {
    for (const positions of [[], [{ x: 100, y: 200 }]]) {
      const raw = { ...makeBundle([first]), [field]: positions };
      const parsed = parseBundleJson(JSON.stringify(raw));
      expect(parsed.bundle).toBeUndefined();
      expect(parsed.error).toContain(field);
    }
  });

  it('rejects nonfinite trie coordinates parsed from valid JSON numbers', () => {
    const raw = JSON.stringify({
      ...makeBundle([first]),
      trieNodePositions: { [prefix('Root')]: { x: 7654321, y: 200 } },
    }).replace('"x":7654321', '"x":1e400');
    expect(parseBundleJson(raw).bundle).toBeUndefined();
    expect(parseBundleJson(raw).error).toBeTruthy();
  });

  it('prunes each map against its own representation across add, edit, and delete while retaining shared prefixes', () => {
    const reports = [
      makeReport('r1', ['Root', 'Shared', 'Old tail'], 'First wording.'),
      makeReport('r2', ['Root', 'Shared', 'Other tail'], 'Second wording.'),
    ];
    const root = prefix('Root');
    const shared = prefix('Root', 'Shared');
    const oldTail = prefix('Root', 'Shared', 'Old tail');
    const otherTail = prefix('Root', 'Shared', 'Other tail');
    const newTail = prefix('Root', 'Shared', 'New tail');
    const bundle = makeBundle(reports, {
      nodePositions: {
        'n:Root': { x: 100, y: 120 },
        'n:Shared': { x: 200, y: 240 },
        'c:r1': { x: 300, y: 500 },
        'c:r2': { x: 700, y: 500 },
        'm:r1': { x: 350, y: 800 },
        'm:r2': { x: 750, y: 800 },
        'n:Unused': { x: 900, y: 900 },
        [root]: { x: 950, y: 950 },
      },
      trieNodePositions: {
        [root]: { x: 1100, y: 120 },
        [shared]: { x: 1200, y: 240 },
        [oldTail]: { x: 1300, y: 500 },
        [otherTail]: { x: 1700, y: 500 },
        'm:r1': { x: 1350, y: 800 },
        'm:r2': { x: 1750, y: 800 },
        [prefix('Unused')]: { x: 1900, y: 900 },
        'n:Root': { x: 1950, y: 950 },
      },
      nodeWidths: { 'm:r1': 440, 'm:r2': 220, 'm:unused': 760 },
    });
    const before = JSON.stringify(bundle);

    const added = addReportToBundleFromFields(bundle, ['Root', 'Shared', 'New tail'], 'Third wording.');
    expect(added.error).toBeUndefined();
    const addedReport = added.bundle!.reports.at(-1)!;
    expect(added.addedNodeIds).toEqual(getNodeIdsForReport(addedReport));
    expect(added.bundle!.nodePositions).not.toHaveProperty('n:Unused');
    expect(added.bundle!.nodePositions).not.toHaveProperty(root);
    expect(added.bundle!.trieNodePositions).not.toHaveProperty(prefix('Unused'));
    expect(added.bundle!.trieNodePositions).not.toHaveProperty('n:Root');
    expect(added.bundle!.trieNodePositions![shared]).toEqual(bundle.trieNodePositions![shared]);
    expect(added.bundle!.nodeWidths).toEqual({ 'm:r1': 440, 'm:r2': 220 });
    expect(JSON.stringify(bundle)).toBe(before);

    const positioned = {
      ...added.bundle!,
      trieNodePositions: { ...added.bundle!.trieNodePositions, [newTail]: { x: 2100, y: 500 } },
    };
    const edited = updateReportInBundle(positioned, 'r1', ['Root', 'Shared', 'New tail'], 'Changed wording.');
    expect(edited.error).toBeUndefined();
    expect(edited.bundle!.trieNodePositions).not.toHaveProperty(oldTail);
    expect(edited.bundle!.trieNodePositions![newTail]).toEqual({ x: 2100, y: 500 });
    expect(edited.bundle!.trieNodePositions![shared]).toEqual(bundle.trieNodePositions![shared]);
    expect(edited.bundle!.nodePositions['c:r1']).toEqual(bundle.nodePositions['c:r1']);
    expect(edited.bundle!.nodePositions['m:r1']).toEqual({ x: 350, y: 800 });
    expect(edited.bundle!.trieNodePositions!['m:r1']).toEqual({ x: 1350, y: 800 });

    const deleted = deleteReportFromBundle(edited.bundle!, 'r1');
    expect(deleted.error).toBeUndefined();
    expect(deleted.bundle!.nodePositions).not.toHaveProperty('c:r1');
    expect(deleted.bundle!.nodePositions).not.toHaveProperty('m:r1');
    expect(deleted.bundle!.trieNodePositions).not.toHaveProperty('m:r1');
    expect(deleted.bundle!.trieNodePositions![newTail]).toEqual({ x: 2100, y: 500 });
    expect(deleted.bundle!.trieNodePositions![shared]).toEqual(bundle.trieNodePositions![shared]);
    expect(deleted.bundle!.nodeWidths).toEqual({ 'm:r2': 220 });

    const removedLastNewPath = deleteReportFromBundle(deleted.bundle!, addedReport.id);
    expect(removedLastNewPath.error).toBeUndefined();
    expect(removedLastNewPath.bundle!.trieNodePositions).not.toHaveProperty(newTail);
    expect(removedLastNewPath.bundle!.trieNodePositions![root]).toEqual(bundle.trieNodePositions![root]);
    expect(removedLastNewPath.bundle!.trieNodePositions![shared]).toEqual(bundle.trieNodePositions![shared]);
    expect(removedLastNewPath.bundle!.trieNodePositions![otherTail]).toEqual(bundle.trieNodePositions![otherTail]);
    expect(removedLastNewPath.bundle!.reports).toEqual([reports[1]]);

    const removedAll = deleteReportFromBundle(removedLastNewPath.bundle!, 'r2');
    expect(removedAll.error).toBeUndefined();
    expect(removedAll.bundle!.reports).toEqual([]);
    expect(removedAll.bundle!.nodePositions).toEqual({});
    expect(removedAll.bundle!.trieNodePositions).toEqual({});
    expect(removedAll.bundle!.nodeWidths).toEqual({});
  });
});
