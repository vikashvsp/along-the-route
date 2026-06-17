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

  // Calculate directions via free public OSRM API
  async getRoute(startLat, startLng, endLat, endLng) {
    const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to compute route");
    }
    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      throw new Error("No route found");
    }

    const route = data.routes[0];
    const distanceKm = (route.distance / 1000).toFixed(1);
    const durationMin = Math.round(route.duration / 60);
    const pathCoords = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);

    return {
      distance: parseFloat(distanceKm),
      duration: durationMin,
      coordinates: pathCoords
    };
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
  async searchPlaces(query) {
    if (!query || query.trim().length < 3) return [];
    const sanitizedQuery = query.substring(0, 40);

    try {
      // Restrict results strictly to Bangalore Metropolitan Area (BBox: 77.30, 12.70, 77.90, 13.25)
      // and bias results toward central Bangalore [12.9716, 77.5946]
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(sanitizedQuery)}&limit=5&lat=12.9716&lon=77.5946&bbox=77.30,12.70,77.90,13.25`;
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
