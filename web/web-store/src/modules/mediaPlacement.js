const DEFAULT_MEDIA_PLACEMENT = {
  desktop: { x: 50, y: 50, zoom: 100 },
  mobile: { x: 50, y: 50, zoom: 100 },
};

function clamp(value, min, max, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
}

export function normalizeMediaPlacement(value) {
  return Object.fromEntries(Object.entries(DEFAULT_MEDIA_PLACEMENT).map(([viewport, defaults]) => {
    const source = value?.[viewport] || {};
    return [viewport, {
      x: clamp(source.x, 0, 100, defaults.x),
      y: clamp(source.y, 0, 100, defaults.y),
      zoom: clamp(source.zoom, 100, 220, defaults.zoom),
    }];
  }));
}
