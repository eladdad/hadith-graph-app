import type { HadithReport } from './types';

/** Explicit choices override collector defaults inferred from transmission chains. */
export type CollectorOverrides = Record<string, boolean>;

export function getCollectorNarrators(
  reports: Pick<HadithReport, 'isnad'>[],
  overrides: CollectorOverrides = {},
): ReadonlySet<string> {
  const collectors = new Set<string>();
  for (const report of reports) {
    // A standalone attribution names its authority, not a transmitting collector.
    // Promoting that name would split its authority nodes in every other report.
    if (report.isnad.length < 2) continue;
    const finalNarrator = report.isnad.at(-1);
    if (finalNarrator !== undefined) collectors.add(finalNarrator);
  }
  for (const [name, isCollector] of Object.entries(overrides)) {
    if (isCollector) collectors.add(name);
    else collectors.delete(name);
  }
  return collectors;
}
