import { describe, expect, it } from 'vitest';
import {
  addReportToBundleFromFields,
  bundleToJson,
  deleteReportFromBundle,
  getEdgeIdsForReport,
  getNodeIdsForReport,
  parseBundleJson,
  setNarratorCollectorInBundle,
  updateReportInBundle,
} from '../src/bundle';
import { getCollectorNarrators } from '../src/collectors';
import { getNarratorNodeIdForReport } from '../src/graph';
import { makeBundle, makeReport } from './helpers';

const first = makeReport('first', ['Root', 'Middle', 'Collector'], 'First wording.');
const second = makeReport('second', ['Root', 'Middle', 'Collector'], 'Second wording.');

describe('collector settings in bundles', () => {
  it('loads old bundles with terminal narrators as default collectors', () => {
    const bundle = parseBundleJson(bundleToJson(makeBundle([first, second]))).bundle!;
    expect(bundle.collectorOverrides).toBeUndefined();
    expect([...getCollectorNarrators(bundle.reports, bundle.collectorOverrides)]).toEqual(['Collector']);
    expect(getNodeIdsForReport(first, 'merged', getCollectorNarrators(bundle.reports))).toContain('c:first');
  });

  it('roundtrips true and false choices, normalizing their narrator names', () => {
    const parsed = parseBundleJson(bundleToJson(makeBundle([first, second], {
      collectorOverrides: { ' Collector  ': false, '  Middle ': true },
    })));
    expect(parsed.error).toBeUndefined();
    expect(parsed.bundle!.collectorOverrides).toEqual({ Collector: false, Middle: true });
    const restored = parseBundleJson(bundleToJson(parsed.bundle!)).bundle!;
    expect(restored.collectorOverrides).toEqual({ Collector: false, Middle: true });
    expect([...getCollectorNarrators(restored.reports, restored.collectorOverrides)]).toEqual(['Middle']);
  });

  it.each([null, [], true, { Collector: 'false' }, { Collector: 0 }, { '  ': true }])(
    'rejects malformed collector overrides: %j',
    (collectorOverrides) => {
      const input = { ...makeBundle([first]), collectorOverrides };
      expect(parseBundleJson(JSON.stringify(input)).error).toMatch(/collector/i);
    },
  );

  it('keeps prototype-like narrator names as ordinary own entries', () => {
    const report = makeReport('special', ['Root', '__proto__'], 'Special wording.');
    const overrides = JSON.parse('{"__proto__":false,"constructor":true}') as Record<string, boolean>;
    const parsed = parseBundleJson(bundleToJson(makeBundle([report], { collectorOverrides: overrides }))).bundle!;
    expect(Object.hasOwn(parsed.collectorOverrides!, '__proto__')).toBe(true);
    expect(parsed.collectorOverrides!.__proto__).toBe(false);
    expect(getCollectorNarrators(parsed.reports, parsed.collectorOverrides).has('__proto__')).toBe(false);
    const toggled = setNarratorCollectorInBundle(parsed, '__proto__', true).bundle!;
    expect(Object.hasOwn(toggled.collectorOverrides!, '__proto__')).toBe(true);
    expect(toggled.collectorOverrides!.__proto__).toBe(true);
  });

  it('reverses collector status and releases only that narrator’s merged coordinates', () => {
    const trieRoot = getNarratorNodeIdForReport(first, 0, 'trie');
    const bundle = makeBundle([first, second], {
      nodePositions: {
        'n:Root': { x: 150, y: 100 },
        'n:Middle': { x: 150, y: 200 },
        'n:Collector': { x: 150, y: 300 },
        'c:first': { x: 200, y: 300 },
        'c:second': { x: 400, y: 300 },
        'm:first': { x: 200, y: 600 },
      },
      trieNodePositions: { [trieRoot]: { x: 900, y: 50 } },
      nodeWidths: { 'm:first': 440 },
    });
    const merged = setNarratorCollectorInBundle(bundle, 'Collector', false).bundle!;
    const collectors = getCollectorNarrators(merged.reports, merged.collectorOverrides);
    expect(merged.collectorOverrides).toEqual({ Collector: false });
    expect(getNodeIdsForReport(first, 'merged', collectors)).toContain('n:Collector');
    expect(getEdgeIdsForReport(first, 'merged', collectors)).toContain('n:Middle->n:Collector');
    expect(merged.nodePositions).toEqual({
      'n:Root': { x: 150, y: 100 },
      'n:Middle': { x: 150, y: 200 },
      'm:first': { x: 200, y: 600 },
    });
    expect(merged.trieNodePositions).toEqual(bundle.trieNodePositions);
    expect(merged.nodeWidths).toEqual(bundle.nodeWidths);
    expect(merged.reports).toBe(bundle.reports);

    const split = setNarratorCollectorInBundle(merged, 'Collector', true).bundle!;
    const splitCollectors = getCollectorNarrators(split.reports, split.collectorOverrides);
    expect(getNodeIdsForReport(first, 'merged', splitCollectors)).toContain('c:first');
    expect(getNodeIdsForReport(second, 'merged', splitCollectors)).toContain('c:second');
    expect(split.nodePositions).toEqual(merged.nodePositions);
    expect(bundle.nodePositions['c:first']).toEqual({ x: 200, y: 300 });
  });

  it('makes arbitrary intermediate narrators collectors and keeps selection IDs in sync', () => {
    const bundle = setNarratorCollectorInBundle(makeBundle([first, second]), 'Middle', true).bundle!;
    const collectors = getCollectorNarrators(bundle.reports, bundle.collectorOverrides);
    const firstMiddle = getNarratorNodeIdForReport(first, 1, 'merged', collectors);
    const secondMiddle = getNarratorNodeIdForReport(second, 1, 'merged', collectors);
    expect(firstMiddle).not.toBe(secondMiddle);
    expect(getNodeIdsForReport(first, 'merged', collectors)).toContain(firstMiddle);
    expect(getEdgeIdsForReport(first, 'merged', collectors)).toEqual([
      `n:Root->${firstMiddle}`, `${firstMiddle}->c:first`,
    ]);
    expect(getNodeIdsForReport(first, 'trie', collectors)).toEqual(getNodeIdsForReport(first, 'trie'));
  });

  it('preserves an explicit shared choice when adding and editing reports', () => {
    const bundle = setNarratorCollectorInBundle(makeBundle([first]), 'Collector', false).bundle!;
    const added = addReportToBundleFromFields(bundle, second.isnad, second.matn);
    expect(added.error).toBeUndefined();
    expect(added.addedNodeIds).toContain('n:Collector');
    expect(added.addedNodeIds).not.toContain(`c:${added.bundle!.reports[1].id}`);
    const updated = updateReportInBundle(added.bundle!, first.id, ['Root', 'Collector'], 'Updated wording.');
    expect(updated.updatedNodeIds).toEqual(['m:first', 'n:Root', 'n:Collector']);
    expect(updated.bundle!.collectorOverrides).toEqual({ Collector: false });
  });

  it('infers new final narrators across the complete bundle during report mutations', () => {
    const original = makeBundle([first], {
      nodePositions: { 'n:Middle': { x: 20, y: 30 }, 'n:Root': { x: 40, y: 50 } },
    });
    const added = addReportToBundleFromFields(original, ['Root', 'Middle'], 'Ends at the middle.').bundle!;
    const collectors = getCollectorNarrators(added.reports, added.collectorOverrides);
    expect(collectors.has('Middle')).toBe(true);
    expect(added.nodePositions['n:Middle']).toBeUndefined();
    expect(added.nodePositions['n:Root']).toEqual({ x: 40, y: 50 });
    const edited = updateReportInBundle(added, first.id, first.isnad, 'Edited first wording.');
    expect(edited.updatedNodeIds).toContain(getNarratorNodeIdForReport(first, 1, 'merged', collectors));
    expect(edited.updatedNodeIds).not.toContain('n:Middle');
    const deleted = deleteReportFromBundle(edited.bundle!, added.reports[1].id).bundle!;
    expect(getCollectorNarrators(deleted.reports).has('Middle')).toBe(false);
  });

  it('rejects setting a narrator absent from the bundle', () => {
    expect(setNarratorCollectorInBundle(makeBundle([first]), 'Missing', true)).toEqual({ error: 'Narrator not found.' });
  });
});
