/**
 * Attempt the next zoom level based on a wheel event's deltaY.
 * Returns the clamped zoom multiplier.
 */
export function applyWheelZoom(
  currentZoom: number,
  deltaY: number,
  { min = 0.25, max = 3, sensitivity = 0.0015 } = {}
): number {
  if (!Number.isFinite(currentZoom)) {
    currentZoom = 1;
  }
  const next = currentZoom * (1 - deltaY * sensitivity);
  const bounded = Math.min(Math.max(next, min), max);
  return Number.isFinite(bounded) ? bounded : currentZoom;
}
