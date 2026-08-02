/** Confidence intervals for figures shown on the site.
 *
 *  Mirrors `foldq.analysis.uncertainty` so the site and the README cannot state
 *  a rate with different qualification. The README reports every headline rate
 *  with an interval; a page showing the bare point estimate invites exactly the
 *  over-reading the interval exists to prevent — most sharply on the QAOA `reps`
 *  table, where the intervals overlap and the apparent trend is not separable.
 */

export interface Interval {
  estimate: number;
  low: number;
  high: number;
  n: number;
}

const Z95 = 1.959963984540054;

/** Wilson score interval for a proportion.
 *
 *  Not the normal approximation, which is wrong exactly where this project's
 *  rates sit: at 30/30 it returns zero width, asserting certainty from 30
 *  observations, and near 0 or 1 it can run outside [0,1].
 */
export function wilsonCi(successes: number, trials: number): Interval {
  if (trials <= 0) return { estimate: NaN, low: NaN, high: NaN, n: 0 };
  const p = successes / trials;
  const denominator = 1 + (Z95 * Z95) / trials;
  const centre = (p + (Z95 * Z95) / (2 * trials)) / denominator;
  const spread =
    (Z95 * Math.sqrt((p * (1 - p)) / trials + (Z95 * Z95) / (4 * trials * trials))) /
    denominator;
  return {
    estimate: p,
    low: Math.max(0, centre - spread),
    high: Math.min(1, centre + spread),
    n: trials,
  };
}

/** `[15.9%, 48.5%]` — the form used beside a rate. */
export function formatInterval(interval: Interval): string {
  if (!Number.isFinite(interval.low)) return "—";
  return `[${(interval.low * 100).toFixed(1)}%, ${(interval.high * 100).toFixed(1)}%]`;
}

/** Whether two intervals overlap.
 *
 *  Used to say plainly when an ordered table does NOT establish a trend, rather
 *  than leaving a reader to infer one from the ordering.
 */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.low <= b.high && b.low <= a.high;
}
