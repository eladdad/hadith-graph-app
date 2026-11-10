import { sanitizeMatnHighlights } from './matnHighlights';
import type { HadithReport, HighlightLegendItem } from './types';

type HighlightProfile = Map<string, number>;

function getHighlightProfile(report: HadithReport, legendIds: Set<string>): HighlightProfile {
  const profile: HighlightProfile = new Map();
  for (const highlight of sanitizeMatnHighlights(report.matnHighlights, report.matn, legendIds)) {
    profile.set(highlight.legendId, (profile.get(highlight.legendId) ?? 0) + highlight.end - highlight.start);
  }
  for (const [id, length] of profile) {
    profile.set(id, length / report.matn.length);
  }
  return profile;
}

function similarity(left: HighlightProfile, right: HighlightProfile): number {
  let intersection = 0;
  let union = 0;
  for (const [id, coverage] of left) {
    const otherCoverage = right.get(id) ?? 0;
    intersection += Math.min(coverage, otherCoverage);
    union += Math.max(coverage, otherCoverage);
  }
  for (const [id, coverage] of right) {
    if (!left.has(id)) union += coverage;
  }
  return union > 0 ? intersection / union : 0;
}

/** Return a reading order without changing report numbers or the saved bundle. */
export function orderMatnsBySimilarity(
  reports: HadithReport[],
  legend: HighlightLegendItem[],
): HadithReport[] {
  const legendIds = new Set(legend.map((entry) => entry.id));
  const highlighted: { report: HadithReport; profile: HighlightProfile }[] = [];
  const unhighlighted: HadithReport[] = [];
  for (const report of reports) {
    const profile = getHighlightProfile(report, legendIds);
    if (profile.size > 0) highlighted.push({ report, profile });
    else unhighlighted.push(report);
  }

  // Weighted Jaccard compares shared labels and their fraction of the full matn.
  // Follow the nearest remaining neighbor, keeping ties in bundle order. This
  // deterministic O(n²) heuristic places identical profiles together without
  // implying a semantic relationship between texts or similarly colored labels.
  const ordered: HadithReport[] = [];
  let current = highlighted.shift();
  while (current) {
    ordered.push(current.report);
    if (highlighted.length === 0) break;
    let bestIndex = 0;
    let bestSimilarity = -1;
    for (let index = 0; index < highlighted.length; index += 1) {
      const score = similarity(current.profile, highlighted[index].profile);
      if (score > bestSimilarity) {
        bestIndex = index;
        bestSimilarity = score;
      }
    }
    [current] = highlighted.splice(bestIndex, 1);
  }
  return [...ordered, ...unhighlighted];
}
