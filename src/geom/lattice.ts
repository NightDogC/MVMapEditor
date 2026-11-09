/* Off-grid coordinates. Documents store cell units (may be fractional); every geometry operation works on integer
   ticks, TICKS per cell. 96 is a multiple of every snap denominator (2, 3, 4, 6, 8), so each snap step is a whole
   number of ticks and unions / subtractions never accumulate floating-point error. */

export const TICKS = 96;

/** Cell units -> ticks. Values read from a file are rounded to 4 decimals, which this recovers exactly. */
export const toT = (v: number): number => Math.round(v * TICKS);

/** Ticks -> cell units, rounded to 4 decimals so files stay readable (1/3 cell is written 0.3333). */
export const fromT = (t: number): number => Math.round((t / TICKS) * 1e4) / 1e4 + 0;

/** Snap a cell-unit value onto the tick lattice. */
export const quantize = (v: number): number => fromT(toT(v));

export interface SnapStep {
  id: string;
  label: string;
  /** step length in ticks; 1 = free (the tick lattice itself) */
  ticks: number;
}

export const SNAP_STEPS: readonly SnapStep[] = [
  { id: "1", label: "1", ticks: TICKS },
  { id: "1/2", label: "½", ticks: TICKS / 2 },
  { id: "1/3", label: "⅓", ticks: TICKS / 3 },
  { id: "1/4", label: "¼", ticks: TICKS / 4 },
  { id: "1/6", label: "⅙", ticks: TICKS / 6 },
  { id: "1/8", label: "⅛", ticks: TICKS / 8 },
  { id: "free", label: "Free", ticks: 1 },
];
export const DEFAULT_SNAP = "1/2";
/** Brush size used by area tools (structure paint / erase) when snapping is free: a free-size brush would only
    produce slivers. */
export const FREE_BRUSH_TICKS = TICKS / 8;

export const snapById = (id: string): SnapStep => SNAP_STEPS.find((s) => s.id === id) || SNAP_STEPS[1];

/** Nearest multiple of `step` (ticks). */
export const roundTo = (t: number, step: number): number => Math.round(t / step) * step;
/** Largest multiple of `step` not above t. */
export const floorTo = (t: number, step: number): number => Math.floor(t / step) * step;

/** Greatest common divisor of two non-negative integers. */
export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
