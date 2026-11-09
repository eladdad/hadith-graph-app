export const DEFAULT_VERTICAL_SPACING = 180;
export const MIN_VERTICAL_SPACING = 80;
export const MAX_VERTICAL_SPACING = 400;

export function normalizeVerticalSpacing(value?: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_VERTICAL_SPACING;
  }

  return Math.min(MAX_VERTICAL_SPACING, Math.max(MIN_VERTICAL_SPACING, Math.round(value)));
}
