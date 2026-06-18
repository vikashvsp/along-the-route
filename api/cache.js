// api/cache.js
// Two-level smart cache for Along-the-Route:
//   L1 — OSRM route results  (keyed by rounded lat/lng pairs)
//   L2 — Overpass POI results (keyed by bounding-box + category)
//
// Freshness policy:
//   - Entries younger than TTL_MS (15 min) are returned immediately as fresh.
//   - Entries older  than TTL_MS are returned immediately (stale) AND trigger a
//     silent background re-fetch via the provided fetchFn callback.
//   - Both caches are cleared on full ride reset.
//   - The POI cache alone is cleared whenever the base route changes so that a
//     new pickup/destination always gets a fresh POI search.

export class RouteCache {
  constructor() {
    // Map<string, { data, cachedAt: number }>
    this._routeCache = new Map();
    this._poiCache   = new Map();

    // 15 minutes — entries older than this trigger a background re-fetch
    this.TTL_MS = 15 * 60 * 1000;
  }

  // ─────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────

  /** Round a coordinate to 4 decimal places (~11 m precision) for key building */
  _r(n) {
    return Math.round(parseFloat(n) * 10000) / 10000;
  }

  _isStale(entry) {
    return Date.now() - entry.cachedAt > this.TTL_MS;
  }

  // ─────────────────────────────────────────────
  // L1 — Route cache (OSRM)
  // ─────────────────────────────────────────────

  /**
   * Build a deterministic key for a 2-point route.
   */
  routeKey(startLat, startLng, endLat, endLng) {
    return `route:${this._r(startLat)},${this._r(startLng)}->${this._r(endLat)},${this._r(endLng)}`;
  }

  /**
   * Build a deterministic key for a 3-point (multi-stop) route.
   */
  multiStopKey(pickupLat, pickupLng, stopLat, stopLng, destLat, destLng) {
    return `multistop:${this._r(pickupLat)},${this._r(pickupLng)}->${this._r(stopLat)},${this._r(stopLng)}->${this._r(destLat)},${this._r(destLng)}`;
  }

  /**
   * Look up a cached route.
   * @returns {{ route: object, isStale: boolean } | null}
   */
  getRoute(key) {
    const entry = this._routeCache.get(key);
    if (!entry) return null;
    return { route: entry.data, isStale: this._isStale(entry) };
  }

  /** Store a route result. */
  setRoute(key, route) {
    this._routeCache.set(key, { data: route, cachedAt: Date.now() });
  }

  // ─────────────────────────────────────────────
  // L2 — POI cache (Overpass)
  // ─────────────────────────────────────────────

  /**
   * Build a cache key from the route's bounding box (rounded to 3 dp, ~110 m)
   * and the category string.  Uses the bbox rather than the full coordinate
   * array so that minor GPS jitter on the same road doesn't produce cache misses.
   */
  poiKey(routeCoordinates, category) {
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;

    const step = Math.max(1, Math.floor(routeCoordinates.length / 40));
    for (let i = 0; i < routeCoordinates.length; i += step) {
      const [lat, lng] = routeCoordinates[i];
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }

    const round3 = (n) => Math.round(n * 1000) / 1000;
    return `poi:${round3(minLat)},${round3(minLng)},${round3(maxLat)},${round3(maxLng)}:${category}`;
  }

  /**
   * Look up cached POIs.
   * @returns {{ pois: object[], isStale: boolean } | null}
   */
  getPOIs(key) {
    const entry = this._poiCache.get(key);
    if (!entry) return null;
    return { pois: entry.data, isStale: this._isStale(entry) };
  }

  /** Store a POI result set. */
  setPOIs(key, pois) {
    this._poiCache.set(key, { data: pois, cachedAt: Date.now() });
  }

  // ─────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────

  /**
   * Clear only the POI cache — called when the base route changes
   * (new pickup / destination).  Route cache is intentionally kept so the
   * user can go back and select the same origin/destination without a re-fetch.
   */
  clearPOICache() {
    this._poiCache.clear();
    console.debug('[RouteCache] POI cache cleared (route changed).');
  }

  /**
   * Clear everything — called on full ride reset.
   */
  clearAll() {
    this._routeCache.clear();
    this._poiCache.clear();
    console.debug('[RouteCache] All caches cleared (full reset).');
  }

  /** Debug: return a human-readable snapshot of what is in cache */
  debugSnapshot() {
    const routes = [...this._routeCache.keys()];
    const pois   = [...this._poiCache.keys()];
    return { routeEntries: routes, poiEntries: pois };
  }
}
