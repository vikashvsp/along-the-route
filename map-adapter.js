// map-adapter.js
// Adapts for Leaflet.js with CartoDB Dark Matter tiles (100% Free / No API Key required)

export class MapAdapter {
  constructor(containerId) {
    this.containerId = containerId;
    this.provider = 'leaflet';
    this.map = null;
    this.markers = {
      pickup: null,
      destination: null,
      driver: null
    };
    this.stopMarkers = []; // Along-the-Route Discovery stop markers
    this.routeLine = null;
  }

  // Initialize Leaflet Map
  async init() {
    await this.loadLeafletSDK();
    this.initLeafletMap();
    return 'leaflet';
  }

  // Load Leaflet Scripts & CSS Dynamically
  loadLeafletSDK() {
    return new Promise((resolve, reject) => {
      if (window.L) {
        resolve();
        return;
      }

      // Leaflet CSS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.onerror = () => reject(new Error("Leaflet CSS failed to load"));
      document.head.appendChild(link);

      // Leaflet JS
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Leaflet JS failed to load"));
      document.head.appendChild(script);
    });
  }

  // Initialize Leaflet Map with beautiful Dark theme
  initLeafletMap() {
    this.map = window.L.map(this.containerId, {
      zoomControl: false,
      attributionControl: false
    }).setView([12.9716, 77.5946], 12);

    // CartoDB Dark Matter tile layer
    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(this.map);
  }

  // Listen to click events on map
  onMapClick(callback) {
    if (!this.map) return;
    this.map.on('click', (e) => {
      callback({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
  }

  // Center Map View
  setView(lat, lng, zoom = 14) {
    if (!this.map) return;
    this.map.setView([lat, lng], zoom);
  }

  // Add customized Marker
  addMarker(lat, lng, type, options = {}) {
    this.removeMarker(type);
    if (!this.map) return null;

    let icon = null;

    // Beautiful custom div-icons for Leaflet to support dark/glass aesthetics
    if (type === 'pickup') {
      icon = window.L.divIcon({
        className: 'custom-pickup-marker',
        html: `<div style="
          width: 16px; 
          height: 16px; 
          background: #fff; 
          border: 3px solid #0a0a0a; 
          border-radius: 50%;
          box-shadow: 0 0 10px rgba(255,255,255,0.8), 0 0 0 3px rgba(255,255,255,0.3);
        "></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });
    } else if (type === 'destination') {
      icon = window.L.divIcon({
        className: 'custom-dest-marker',
        html: `<div style="
          width: 16px; 
          height: 16px; 
          background: #276ef1; 
          border: 3px solid #0a0a0a; 
          border-radius: 2px;
          box-shadow: 0 0 10px rgba(39, 110, 241, 0.8), 0 0 0 3px rgba(39, 110, 241, 0.3);
        "></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });
    } else if (type === 'driver') {
      const rotation = options.rotation || 0;
      icon = window.L.divIcon({
        className: 'custom-driver-marker',
        html: `<div style="
          width: 30px; 
          height: 30px; 
          background: #000; 
          border: 2px solid #fff; 
          border-radius: 50%; 
          display: flex; 
          align-items: center; 
          justify-content: center;
          box-shadow: 0 4px 10px rgba(0,0,0,0.5);
          transform: rotate(${rotation}deg);
          transition: transform 0.1s ease;
        ">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="color: #fff;">
            <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 10l1.5-4.5h11L19 10H5z"/>
          </svg>
        </div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
    } else if (type === 'stop') {
      icon = window.L.divIcon({
        className: 'custom-stop-marker',
        html: `<div style="
          width: 14px; 
          height: 14px; 
          background: #f59e0b; 
          border: 3px solid #0a0a0a; 
          border-radius: 50%;
          box-shadow: 0 0 10px rgba(245, 158, 11, 0.8), 0 0 0 3px rgba(245, 158, 11, 0.3);
        "></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });
    }

    const markerObj = window.L.marker([lat, lng], { icon }).addTo(this.map);
    if (options.popupText) {
      markerObj.bindPopup(options.popupText);
    }
    
    this.markers[type] = markerObj;
    return markerObj;
  }

  // Remove marker from map
  removeMarker(type) {
    if (!this.markers[type]) return;
    if (this.map) {
      this.map.removeLayer(this.markers[type]);
    }
    this.markers[type] = null;
  }

  // Calculate directions via free public OSRM API.
  // @param {RouteCache|null} cache  - optional L1 cache instance
  // @param {Function|null}   onStaleRefresh - called with fresh route when background re-fetch completes
  async getRoute(startLat, startLng, endLat, endLng, cache = null, onStaleRefresh = null) {
    const fetchFresh = async () => {
      const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to compute route');
      const data = await response.json();
      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) throw new Error('No route found');

      const route = data.routes[0];
      return {
        distance: parseFloat((route.distance / 1000).toFixed(1)),
        duration: Math.round(route.duration / 60),
        coordinates: route.geometry.coordinates.map(c => [c[1], c[0]])
      };
    };

    if (cache) {
      const key = cache.routeKey(startLat, startLng, endLat, endLng);
      const hit = cache.getRoute(key);

      if (hit) {
        if (hit.isStale && onStaleRefresh) {
          // Serve stale immediately, silently refresh in background
          console.debug('[Cache] Stale route hit — serving stale, background refetching:', key);
          fetchFresh().then(freshRoute => {
            cache.setRoute(key, freshRoute);
            onStaleRefresh(freshRoute);
          }).catch(err => console.warn('[Cache] Background route re-fetch failed:', err));
        } else {
          console.debug('[Cache] Fresh route hit:', key);
        }
        return hit.route;
      }

      // Cache miss — fetch and store
      console.debug('[Cache] Route miss — fetching:', key);
      const freshRoute = await fetchFresh();
      cache.setRoute(key, freshRoute);
      return freshRoute;
    }

    // No cache provided — plain fetch
    return fetchFresh();
  }

  // Draw polyline route on Map
  drawRoute(coordinates) {
    this.clearRoute();
    if (!this.map) return;

    this.routeLine = window.L.polyline(coordinates, {
      color: '#276ef1',
      weight: 5,
      opacity: 0.8,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(this.map);

    // Fit map view to route bounds
    this.map.fitBounds(this.routeLine.getBounds(), {
      padding: [50, 50]
    });
  }

  // Clear polyline route
  clearRoute() {
    if (!this.routeLine) return;
    if (this.map) {
      this.map.removeLayer(this.routeLine);
    }
    this.routeLine = null;
  }

  // Autocomplete place suggestions via Photon Komoot search API (highly performant search-as-you-type)
  async searchPlaces(query, biasLat = null, biasLng = null) {
    if (!query || query.trim().length < 3) return [];
    const sanitizedQuery = query.substring(0, 40);

    let lat = biasLat;
    let lng = biasLng;

    if (lat === null || lng === null) {
      if (this.map) {
        const center = this.map.getCenter();
        lat = center.lat;
        lng = center.lng;
      } else {
        lat = 12.9716;
        lng = 77.5946;
      }
    }

    try {
      // Bias results toward the resolved location (no strict bbox limit to support dynamic city usage)
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(sanitizedQuery)}&limit=5&lat=${lat}&lon=${lng}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data && data.features) {
          return data.features.map(feature => {
            const props = feature.properties;
            const geom = feature.geometry;
            
            // Build a friendly display name
            const name = props.name || props.street || props.city || "Location";
            
            // Build a descriptive address subtitle
            const subtitleParts = [];
            if (props.street && props.name !== props.street) subtitleParts.push(props.street);
            if (props.city) subtitleParts.push(props.city);
            if (props.state) subtitleParts.push(props.state);
            const subname = subtitleParts.join(', ') || props.country || '';
            
            return {
              name: name,
              subname: subname,
              // GeoJSON coordinates are [lon, lat]
              lat: parseFloat(geom.coordinates[1]),
              lng: parseFloat(geom.coordinates[0])
            };
          }).filter(item => !isNaN(item.lat) && !isNaN(item.lng));
        }
      }
    } catch (err) {
      console.error("Photon Search API failed:", err);
    }

    return [];
  }

  // =============================================
  // Along-the-Route Discovery Methods
  // =============================================

  // Split route coordinate array into n roughly-equal segments.
  // Short routes that can't fill n segments degrade gracefully (fewer returned).
  _splitRouteIntoSegments(coords, n = 3) {
    if (coords.length < n) return [coords]; // too short — treat as one segment
    const size = Math.ceil(coords.length / n);
    return Array.from({ length: n }, (_, i) =>
      coords.slice(i * size, Math.min((i + 1) * size, coords.length))
    ).filter(seg => seg.length > 0);
  }

  // Compute a bounding box for a coordinate segment with ~800m buffer.
  _bboxForCoords(coords) {
    const BUFFER = 0.008; // ~800m in degrees
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;
    coords.forEach(([lat, lng]) => {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    });
    return {
      minLat: minLat - BUFFER,
      maxLat: maxLat + BUFFER,
      minLng: minLng - BUFFER,
      maxLng: maxLng + BUFFER,
    };
  }

  // Build an Overpass QL query string for a set of tags within a bbox.
  _buildOverpassQuery(tags, bbox) {
    const { minLat, minLng, maxLat, maxLng } = bbox;
    const bboxStr = `${minLat},${minLng},${maxLat},${maxLng}`;
    const tagQueries = tags.map(tag => {
      const [key, value] = tag.split('=');
      return `node["${key}"="${value}"](${bboxStr});\nway["${key}"="${value}"](${bboxStr});`;
    }).join('\n');
    return `[out:json][timeout:10];\n(\n${tagQueries}\n);\nout center 20;`;
  }

  // Parse raw Overpass elements into clean POI objects.
  // Returns an array of POI objects (nulls filtered out) without detour > 10 min.
  _parseOverpassElements(elements, category, routeCoordinates) {
    if (!elements || !elements.length) return [];
    return elements
      .map(el => {
        const lat = el.lat || (el.center && el.center.lat);
        const lng = el.lon || (el.center && el.center.lon);
        if (!lat || !lng) return null;
        const name = (el.tags && el.tags.name) || 'Unnamed';
        const detourInfo = this._estimateDetour(lat, lng, routeCoordinates);
        return {
          osmId: String(el.id),         // used for cross-segment deduplication
          name,
          lat,
          lng,
          category,
          distanceFromRoute: detourInfo.distanceKm,
          estimatedDetourMin: detourInfo.estimatedMinutes,
          osmTags: el.tags || {}
        };
      })
      .filter(poi => poi !== null && poi.estimatedDetourMin <= 10);
  }

  // Search for POIs along a route corridor using Overpass API.
  //
  // Progressive batching:
  //   The route is split into 3 geographic segments. One Overpass query fires
  //   per segment, all in parallel. As each resolves, onBatchReady() is called
  //   immediately so the UI can show results before all segments finish.
  //
  // @param {RouteCache|null} cache          - optional L2 cache instance
  // @param {Function|null}   onStaleRefresh - called with fresh POIs when stale entry re-fetched
  // @param {Function|null}   onBatchReady   - (newPOIs, allSoFar, isLastBatch) => void
  // @param {AbortSignal|null} signal        - AbortController signal to cancel in-flight requests
  async searchPOIsAlongRoute(
    routeCoordinates,
    category,
    cache = null,
    onStaleRefresh = null,
    onBatchReady = null,
    signal = null
  ) {
    if (!routeCoordinates || routeCoordinates.length === 0) {
      return { pois: [], fromCache: false };
    }

    // OSM tag mapping per category
    const categoryTags = {
      'florist':    ['shop=florist'],
      'cafe':       ['amenity=cafe'],
      'restaurant': ['amenity=restaurant'],
      'pharmacy':   ['amenity=pharmacy'],
      'grocery':    ['shop=supermarket', 'shop=convenience'],
      'gift':       ['shop=gift']
    };
    const tags = categoryTags[category];
    if (!tags) return { pois: [], fromCache: false };

    // ── Cache-aware path ──────────────────────────────────────────────────
    if (cache) {
      const key = cache.poiKey(routeCoordinates, category);
      const hit = cache.getPOIs(key);

      if (hit) {
        if (hit.isStale && onStaleRefresh) {
          console.debug('[Cache] Stale POI hit — serving stale, background refetching:', key);
          // Background re-fetch also uses the batched path (no onBatchReady — silent)
          this._fetchPOIsBatched(routeCoordinates, tags, category, null, signal)
            .then(freshPOIs => {
              cache.setPOIs(key, freshPOIs);
              onStaleRefresh(freshPOIs);
            })
            .catch(err => {
              if (err.name !== 'AbortError') {
                console.warn('[Cache] Background POI re-fetch failed:', err);
              }
            });
        } else {
          console.debug('[Cache] Fresh POI hit:', key);
        }
        return { pois: hit.pois, fromCache: true };
      }

      // Cache miss — fetch with batching.
      // We wrap onBatchReady to track accumulated POIs locally so we can
      // persist them even if the user switches categories mid-fetch (AbortError).
      console.debug('[Cache] POI miss — fetching (batched):', key);
      let _latestAccumulated = [];
      const wrappedOnBatchReady = onBatchReady
        ? (newPOIs, allSoFar, isLastBatch) => {
            _latestAccumulated = allSoFar; // keep latest snapshot
            onBatchReady(newPOIs, allSoFar, isLastBatch);
          }
        : (_, allSoFar) => { _latestAccumulated = allSoFar; };

      try {
        const pois = await this._fetchPOIsBatched(routeCoordinates, tags, category, wrappedOnBatchReady, signal);
        cache.setPOIs(key, pois);
        return { pois, fromCache: false };
      } catch (err) {
        if (err.name === 'AbortError') {
          // User switched categories — but persist whatever segments already resolved.
          // This way coming back to this category shows cached partial results instantly.
          if (_latestAccumulated.length > 0) {
            const partialSorted = [..._latestAccumulated]
              .sort((a, b) => a.estimatedDetourMin - b.estimatedDetourMin)
              .slice(0, 8);
            cache.setPOIs(key, partialSorted);
            console.debug('[Cache] Partial POI results cached on abort:', partialSorted.length, 'POIs for', key);
          }
          throw err; // still re-throw so caller knows it was cancelled
        }
        console.error('Batched Overpass request failed:', err);
        return { pois: [], fromCache: false };
      }

    }

    // ── No-cache fallback ────────────────────────────────────────────────
    try {
      const pois = await this._fetchPOIsBatched(routeCoordinates, tags, category, onBatchReady, signal);
      return { pois, fromCache: false };
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      console.error('Batched Overpass request failed (no cache):', err);
      return { pois: [], fromCache: false };
    }
  }

  // Internal: fire 3 parallel Overpass queries (one per route segment) and
  // progressively call onBatchReady() as each resolves.
  // Returns the final merged + sorted + sliced list when all 3 settle.
  async _fetchPOIsBatched(routeCoordinates, tags, category, onBatchReady, signal) {
    const segments = this._splitRouteIntoSegments(routeCoordinates, 3);
    const seenIds = new Set();   // cross-segment deduplication by OSM element ID
    const allPOIs = [];          // accumulates results across batches
    let totalSettled = 0;        // increments on BOTH success and failure

    // Build one promise per segment. We don't await them sequentially —
    // each .then() fires as soon as that segment resolves, enabling progressive UI updates.
    const segmentPromises = segments.map((segCoords, idx) => {
      const bbox = this._bboxForCoords(segCoords);
      const query = this._buildOverpassQuery(tags, bbox);

      return fetch('/api/overpass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal,                  // honours AbortController from caller
      })
        .then(res => {
          if (!res.ok) throw new Error(`Segment ${idx + 1}: proxy returned HTTP ${res.status}`);
          return res.json();
        })
        .then(data => {
          totalSettled++;
          const parsed = this._parseOverpassElements(data.elements, category, routeCoordinates);

          // Deduplicate: only keep POIs whose OSM ID we haven't seen yet
          const newPOIs = parsed.filter(poi => {
            if (seenIds.has(poi.osmId)) return false;
            seenIds.add(poi.osmId);
            return true;
          });

          allPOIs.push(...newPOIs);

          const isLastBatch = (totalSettled === segments.length);
          if (onBatchReady && (newPOIs.length > 0 || isLastBatch)) {
            onBatchReady(newPOIs, [...allPOIs], isLastBatch);
          }

          console.debug(`[Batched] Segment ${idx + 1}/${segments.length} resolved — ${newPOIs.length} new POIs`);
          return newPOIs;
        })
        .catch(err => {
          // Count failures toward totalSettled so isLastBatch is accurate
          totalSettled++;
          const isLastBatch = (totalSettled === segments.length);
          if (err.name !== 'AbortError') {
            console.warn(`[Batched] Segment ${idx + 1} failed:`, err.message);
            // If this was the last segment settling, finalize UI state
            if (onBatchReady && isLastBatch && allPOIs.length > 0) {
              onBatchReady([], [...allPOIs], true);
            }
          }
          throw err; // re-throw so allSettled captures it
        });
    });

    // Promise.allSettled so one failed segment doesn't kill the others.
    // (AbortError rejections are captured here — we check signal.aborted to propagate cleanly)
    await Promise.allSettled(segmentPromises);

    // If the controller was aborted, propagate so the caller can discard cleanly
    if (signal && signal.aborted) {
      throw new DOMException('POI search aborted', 'AbortError');
    }

    // Final sort by detour, cap at 8
    return allPOIs
      .sort((a, b) => a.estimatedDetourMin - b.estimatedDetourMin)
      .slice(0, 8);
  }


  // Estimate detour time for a POI based on distance from nearest route point
  _estimateDetour(poiLat, poiLng, routeCoordinates) {
    let minDist = Infinity;

    // Sample every 5th point for performance
    const step = Math.max(1, Math.floor(routeCoordinates.length / 50));
    for (let i = 0; i < routeCoordinates.length; i += step) {
      const d = haversineDistance(poiLat, poiLng, routeCoordinates[i][0], routeCoordinates[i][1]);
      if (d < minDist) minDist = d;
    }

    // Round-trip detour estimate: go to POI + come back to route + 2 min stop time
    const detourKm = minDist * 2;
    // Assume city speed ~25 km/h, plus 2 min for the stop itself
    const detourMinutes = Math.round((detourKm / 25) * 60) + 2;

    return {
      distanceKm: parseFloat(minDist.toFixed(2)),
      estimatedMinutes: Math.max(2, detourMinutes) // Minimum 2 min
    };
  }

  // Get multi-stop route: pickup → stop → destination via OSRM
  // @param {RouteCache|null} cache  - optional L1 cache instance
  // @param {Function|null}   onStaleRefresh - called with fresh route on background re-fetch
  async getMultiStopRoute(pickupLat, pickupLng, stopLat, stopLng, destLat, destLng, cache = null, onStaleRefresh = null) {
    const fetchFresh = async () => {
      const url = `https://router.project-osrm.org/route/v1/driving/${pickupLng},${pickupLat};${stopLng},${stopLat};${destLng},${destLat}?overview=full&geometries=geojson`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to compute multi-stop route');
      const data = await response.json();
      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) throw new Error('No multi-stop route found');

      const route = data.routes[0];
      return {
        distance: parseFloat((route.distance / 1000).toFixed(1)),
        duration: Math.round(route.duration / 60),
        coordinates: route.geometry.coordinates.map(c => [c[1], c[0]])
      };
    };

    if (cache) {
      const key = cache.multiStopKey(pickupLat, pickupLng, stopLat, stopLng, destLat, destLng);
      const hit = cache.getRoute(key);

      if (hit) {
        if (hit.isStale && onStaleRefresh) {
          console.debug('[Cache] Stale multi-stop route hit — background refetching:', key);
          fetchFresh().then(freshRoute => {
            cache.setRoute(key, freshRoute);
            onStaleRefresh(freshRoute);
          }).catch(err => console.warn('[Cache] Background multi-stop re-fetch failed:', err));
        } else {
          console.debug('[Cache] Fresh multi-stop route hit:', key);
        }
        return hit.route;
      }

      console.debug('[Cache] Multi-stop route miss — fetching:', key);
      const freshRoute = await fetchFresh();
      cache.setRoute(key, freshRoute);
      return freshRoute;
    }

    return fetchFresh();
  }

  // Add a stop marker (separate from the main markers dict since multiple could exist)
  addStopMarker(lat, lng, popupText) {
    const marker = this.addMarker(lat, lng, 'stop', { popupText });
    // addMarker sets this.markers['stop'], but we also track in the array
    this.stopMarkers.push(marker);
    return marker;
  }

  // Remove all stop markers from the map
  removeAllStopMarkers() {
    this.stopMarkers.forEach(m => {
      if (this.map && m) this.map.removeLayer(m);
    });
    this.stopMarkers = [];
    // Also clear the main markers entry
    if (this.markers.stop) {
      this.removeMarker('stop');
    }
  }
}

// Haversine distance in km between two lat/lng pairs
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Math Utility: Calculate bearing/heading between coordinates to rotate driver car marker
export function calculateBearing(startLat, startLng, endLat, endLng) {
  const startLatRad = (startLat * Math.PI) / 180;
  const startLngRad = (startLng * Math.PI) / 180;
  const endLatRad = (endLat * Math.PI) / 180;
  const endLngRad = (endLng * Math.PI) / 180;
  const dLon = endLngRad - startLngRad;
  const y = Math.sin(dLon) * Math.cos(endLatRad);
  const x = Math.cos(startLatRad) * Math.sin(endLatRad) -
            Math.sin(startLatRad) * Math.cos(endLatRad) * Math.cos(dLon);
  let brng = Math.atan2(y, x);
  brng = (brng * 180) / Math.PI;
  return (brng + 360) % 360;
}
