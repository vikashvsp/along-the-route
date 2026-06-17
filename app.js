// app.js
import { MapAdapter, calculateBearing } from './map-adapter.js';

// Application State
const state = {
  currentStep: 'search', // 'search' | 'select-ride' | 'matching' | 'active-ride' | 'completed'
  pickup: { name: '', lat: null, lng: null },
  destination: { name: '', lat: null, lng: null },
  route: null, // { distance, duration, coordinates }
  originalRoute: null, // Cached original direct route
  intermediateStop: null, // Intermediate stop if added
  discoveryOpen: false, // Whether the discovery drawer is open
  selectedVehicle: null,
  driverMarker: null,
  activeRideInterval: null,
  mapAdapter: null,
  activeInputField: 'destination' // Default to 'destination' on load
};

// Helper: Reverse geocode coordinates using Photon Komoot API
async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=1`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.features && data.features.length > 0) {
        const props = data.features[0].properties;
        const name = props.name || props.street || "Map Point";
        const city = props.city || props.district || props.state || "";
        return city ? `${name}, ${city}` : name;
      }
    }
  } catch (err) {
    console.warn("Reverse geocoding error:", err);
  }
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

// Vehicle Options Data (with inline SVGs for premium standalone loading)
const vehicles = [
  {
    id: 'ubergo',
    name: 'UberGo',
    capacity: 4,
    baseFare: 50,
    perKmRate: 15,
    etaRange: [2, 5],
    desc: 'Affordable, everyday rides',
    svg: `<svg viewBox="0 0 100 50" class="ride-icon-svg">
      <path d="M15,35 Q15,22 30,22 L70,22 Q85,22 85,35 Z" fill="#b0b0b0"/>
      <path d="M25,25 L45,25 L42,12 L28,12 Z" fill="#e8e8e8"/>
      <path d="M52,25 L72,25 L68,12 L55,12 Z" fill="#e8e8e8"/>
      <circle cx="30" cy="38" r="10" fill="#222" stroke="#fff" stroke-width="2"/>
      <circle cx="70" cy="38" r="10" fill="#222" stroke="#fff" stroke-width="2"/>
      <circle cx="30" cy="38" r="4" fill="#888"/>
      <circle cx="70" cy="38" r="4" fill="#888"/>
      <rect x="80" y="27" width="6" height="4" fill="#ffc000" rx="1"/>
      <rect x="12" y="27" width="6" height="4" fill="#ffffff" rx="1"/>
    </svg>`
  },
  {
    id: 'premier',
    name: 'Premier',
    capacity: 4,
    baseFare: 80,
    perKmRate: 22,
    etaRange: [1, 3],
    desc: 'Comfortable sedans, top-rated drivers',
    svg: `<svg viewBox="0 0 100 50" class="ride-icon-svg">
      <path d="M10,36 L12,28 Q15,16 35,16 L65,16 Q80,16 88,26 L90,36 Z" fill="#444444"/>
      <path d="M25,18 L48,18 L46,8 L30,8 Z" fill="#c0c0c0"/>
      <path d="M52,18 L72,18 L68,8 L55,8 Z" fill="#c0c0c0"/>
      <circle cx="28" cy="38" r="10" fill="#111" stroke="#fff" stroke-width="2"/>
      <circle cx="72" cy="38" r="10" fill="#111" stroke="#fff" stroke-width="2"/>
      <rect x="86" y="28" width="6" height="4" fill="#ffc000" rx="1"/>
      <rect x="8" y="28" width="6" height="4" fill="#ffffff" rx="1"/>
    </svg>`
  },
  {
    id: 'uberxl',
    name: 'UberXL',
    capacity: 6,
    baseFare: 120,
    perKmRate: 28,
    etaRange: [4, 7],
    desc: 'Spacious SUVs for groups of 6',
    svg: `<svg viewBox="0 0 100 50" class="ride-icon-svg">
      <path d="M10,38 L12,20 L35,14 L75,14 L86,23 L90,38 Z" fill="#3182ce"/>
      <path d="M20,17 L45,17 L44,8 L32,8 Z" fill="#e2e8f0"/>
      <path d="M50,17 L75,17 L72,8 L52,8 Z" fill="#e2e8f0"/>
      <circle cx="28" cy="40" r="10" fill="#222" stroke="#fff" stroke-width="2"/>
      <circle cx="72" cy="40" r="10" fill="#222" stroke="#fff" stroke-width="2"/>
      <rect x="86" y="27" width="6" height="4" fill="#ffc000"/>
    </svg>`
  },
  {
    id: 'uberauto',
    name: 'UberAuto',
    capacity: 3,
    baseFare: 30,
    perKmRate: 10,
    etaRange: [2, 4],
    desc: 'Quick auto-rickshaw rides',
    svg: `<svg viewBox="0 0 100 50" class="ride-icon-svg">
      <path d="M30,8 L60,8 L65,22 L15,22 L20,12 Z" fill="#ffcc00"/>
      <path d="M15,22 L75,22 L70,38 L25,38 Z" fill="#222"/>
      <rect x="35" y="12" width="16" height="7" fill="#e8e8e8"/>
      <circle cx="25" cy="40" r="8" fill="#111" stroke="#fff"/>
      <circle cx="65" cy="40" r="8" fill="#111" stroke="#fff"/>
      <circle cx="45" cy="40" r="4" fill="#888"/>
      <line x1="15" y1="22" x2="25" y2="40" stroke="#fff" stroke-width="2"/>
    </svg>`
  },
  {
    id: 'ubermoto',
    name: 'Moto',
    capacity: 1,
    baseFare: 15,
    perKmRate: 7,
    etaRange: [1, 3],
    desc: 'Speedy bike rides for single traveler',
    svg: `<svg viewBox="0 0 100 50" class="ride-icon-svg">
      <circle cx="25" cy="35" r="12" fill="none" stroke="#e2e8f0" stroke-width="6"/>
      <circle cx="75" cy="35" r="12" fill="none" stroke="#e2e8f0" stroke-width="6"/>
      <path d="M25,35 L45,20 L65,20 L75,35" fill="none" stroke="#222" stroke-width="5"/>
      <path d="M40,20 L48,8 L58,8" fill="none" stroke="#276ef1" stroke-width="4"/>
      <circle cx="58" cy="8" r="4" fill="#276ef1"/>
    </svg>`
  }
];

// Helper: Debouncer for inputs
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// State Machine Panel switcher
function showPanelStep(stepId) {
  document.querySelectorAll('.panel-step').forEach(panel => {
    panel.classList.remove('active');
  });
  
  const activePanel = document.getElementById(`panel-${stepId}`);
  if (activePanel) {
    activePanel.classList.add('active');
  }
  
  state.currentStep = stepId;
}

// Calculate Fares based on route distance
function renderVehicleOptions() {
  const container = document.getElementById('ride-options-container');
  container.innerHTML = '';
  
  const dist = state.route.distance;

  vehicles.forEach((vehicle, idx) => {
    const rawPrice = vehicle.baseFare + (dist * vehicle.perKmRate);
    const price = Math.round(rawPrice);
    const strikePrice = Math.round(rawPrice * 1.25);
    const eta = Math.round(vehicle.etaRange[0] + Math.random() * (vehicle.etaRange[1] - vehicle.etaRange[0]));

    const card = document.createElement('div');
    card.className = `ride-option-card ${idx === 0 ? 'selected' : ''}`;
    card.dataset.id = vehicle.id;
    card.dataset.price = price;
    
    if (idx === 0) {
      state.selectedVehicle = { ...vehicle, price, eta };
    }

    card.innerHTML = `
      <div class="ride-icon-wrapper">
        ${vehicle.svg}
      </div>
      <div class="ride-option-details">
        <div class="ride-name-row">
          <span class="ride-name">${vehicle.name}</span>
          <span class="ride-capacity-badge">
            <i data-lucide="user"></i> ${vehicle.capacity}
          </span>
        </div>
        <div class="ride-eta">${eta} min away • ${vehicle.desc}</div>
      </div>
      <div class="ride-price-details">
        <span class="ride-price">₹${price.toFixed(2)}</span>
        <span class="ride-price-strike">₹${strikePrice.toFixed(2)}</span>
      </div>
    `;

    card.addEventListener('click', () => {
      document.querySelectorAll('.ride-option-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.selectedVehicle = { ...vehicle, price, eta };
    });

    container.appendChild(card);
  });
  
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Generate Route between pickup and destination
async function handleRouteCalculation() {
  if (!state.pickup.lat || !state.destination.lat) return;
  
  const badge = document.getElementById('provider-badge');
  const badgeText = document.getElementById('provider-text');
  badgeText.textContent = "Calculating route...";
  badge.style.display = "flex";

  try {
    const route = await state.mapAdapter.getRoute(
      state.pickup.lat, state.pickup.lng,
      state.destination.lat, state.destination.lng
    );
    
    state.route = route;
    state.originalRoute = route; // Cache original route
    state.intermediateStop = null; // Clear stop

    // Clear any existing stop markers and UI
    if (state.mapAdapter.removeAllStopMarkers) {
      state.mapAdapter.removeAllStopMarkers();
    }
    const stopBanner = document.getElementById('stop-added-banner');
    if (stopBanner) stopBanner.classList.remove('visible');
    const summaryStop = document.getElementById('route-summary-stop');
    if (summaryStop) summaryStop.classList.remove('visible');
    const triggerBtn = document.getElementById('discovery-trigger-btn');
    if (triggerBtn) triggerBtn.style.display = 'flex';
    closeDiscovery();

    // Draw route on map
    state.mapAdapter.drawRoute(route.coordinates);
    
    // Add markers
    state.mapAdapter.addMarker(state.pickup.lat, state.pickup.lng, 'pickup', { popupText: 'Pickup: ' + state.pickup.name });
    state.mapAdapter.addMarker(state.destination.lat, state.destination.lng, 'destination', { popupText: 'Destination: ' + state.destination.name });

    // Update UI headers
    document.getElementById('summary-distance').textContent = `${route.distance} km`;
    document.getElementById('summary-duration').textContent = `${route.duration} mins`;

    renderVehicleOptions();
    showPanelStep('select-ride');
    
    badgeText.textContent = `Map Engine • Connected`;
  } catch (err) {
    console.error("Routing error: ", err);
    alert("Could not compute route between these locations. Please choose another location.");
    badgeText.textContent = "Routing Failed";
  }
}

// Setup Slide Confirm Button
function setupSlideConfirm() {
  const track = document.getElementById('slide-button-track');
  const handle = document.getElementById('slide-button-handle');
  const text = document.querySelector('.slide-button-text');
  
  if (!track || !handle) return;
  
  let isDragging = false;
  let startX = 0;
  let maxSlide = 0;
  
  const getPositionX = (event) => {
    return event.type.includes('mouse') ? event.clientX : event.touches[0].clientX;
  };
  
  const startDrag = (e) => {
    isDragging = true;
    startX = getPositionX(e);
    maxSlide = track.offsetWidth - handle.offsetWidth - 8; // margins
    handle.style.transition = 'none';
  };
  
  const drag = (e) => {
    if (!isDragging) return;
    const currentX = getPositionX(e);
    let deltaX = currentX - startX;
    
    if (deltaX < 0) deltaX = 0;
    if (deltaX > maxSlide) deltaX = maxSlide;
    
    handle.style.left = `${deltaX + 4}px`;
    
    const progress = deltaX / maxSlide;
    text.style.opacity = 1 - progress * 1.5;
  };
  
  const endDrag = () => {
    if (!isDragging) return;
    isDragging = false;
    
    const currentLeft = parseFloat(handle.style.left) - 4;
    
    if (currentLeft >= maxSlide * 0.85) {
      handle.style.transition = 'left 0.2s ease';
      handle.style.left = `${maxSlide + 4}px`;
      text.style.opacity = 0;
      
      setTimeout(() => {
        startBookingFlow();
      }, 200);
    } else {
      handle.style.transition = 'left 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      handle.style.left = '4px';
      text.style.opacity = 1;
    }
  };
  
  handle.addEventListener('mousedown', startDrag);
  window.addEventListener('mousemove', drag);
  window.addEventListener('mouseup', endDrag);
  
  handle.addEventListener('touchstart', startDrag);
  window.addEventListener('touchmove', drag);
  window.addEventListener('touchend', endDrag);
}

// Reset Slide Confirm Button
function resetSlideButton() {
  const handle = document.getElementById('slide-button-handle');
  const text = document.querySelector('.slide-button-text');
  if (handle && text) {
    handle.style.left = '4px';
    text.style.opacity = 1;
  }
}

// STEP 3: Start Booking Flow (Simulated matching)
function startBookingFlow() {
  showPanelStep('matching');
  const statusEl = document.getElementById('matching-status');
  
  const steps = [
    { text: "Contacting drivers nearby...", delay: 0 },
    { text: "Driver found! Confirming details...", delay: 2000 },
    { text: "Driver accepted! Rajesh is heading your way.", delay: 4000 }
  ];
  
  steps.forEach(step => {
    setTimeout(() => {
      if (state.currentStep === 'matching') {
        statusEl.textContent = step.text;
      }
    }, step.delay);
  });
  
  setTimeout(() => {
    if (state.currentStep === 'matching') {
      startActiveRide();
    }
  }, 5000);
}

// STEP 4: Active Ride Simulation
function startActiveRide() {
  showPanelStep('active-ride');
  
  const otp = Math.floor(1000 + Math.random() * 9000);
  document.getElementById('trip-otp').textContent = `OTP: ${otp}`;
  
  const names = ["Rajesh Kumar", "Amit Singh", "Sunil Sharma", "Deepak Gupta"];
  const driverName = names[Math.floor(Math.random() * names.length)];
  const vehicle = state.selectedVehicle;
  
  document.getElementById('driver-name').textContent = driverName;
  document.getElementById('vehicle-details').textContent = `${vehicle.name} • KA 03 M ${Math.floor(1000 + Math.random() * 9000)}`;
  
  const coords = state.route.coordinates;
  const numCoords = coords.length;

  let stopCoordIdx = -1;
  let hasReachedStop = false;
  if (state.intermediateStop) {
    let minDist = Infinity;
    for (let i = 0; i < numCoords; i++) {
      const latDiff = coords[i][0] - state.intermediateStop.lat;
      const lngDiff = coords[i][1] - state.intermediateStop.lng;
      const d = latDiff * latDiff + lngDiff * lngDiff;
      if (d < minDist) {
        minDist = d;
        stopCoordIdx = i;
      }
    }
  }
  
  const pickupCoord = coords[0];
  let driverLat = pickupCoord[0] + (Math.random() - 0.5) * 0.015;
  let driverLng = pickupCoord[1] + (Math.random() - 0.5) * 0.015;
  
  state.mapAdapter.addMarker(driverLat, driverLng, 'driver', { rotation: 0 });
  
  let step = 0;
  const totalArriveSteps = 10;
  
  const statusTitle = document.getElementById('trip-status-title');
  const statusDesc = document.getElementById('trip-status-desc');
  const progressBar = document.getElementById('trip-progress-fill-flat');
  const etaText = document.getElementById('trip-eta-text');
  const distText = document.getElementById('trip-distance-remaining');
  
  statusTitle.textContent = "Driver is arriving";
  statusDesc.textContent = `${driverName} is arriving at your pickup location.`;
  progressBar.style.width = "0%";
  etaText.textContent = `Arriving in ${vehicle.eta} mins`;
  distText.textContent = `0.8 km remaining`;
  
  const stepLatDiff = (pickupCoord[0] - driverLat) / totalArriveSteps;
  const stepLngDiff = (pickupCoord[1] - driverLng) / totalArriveSteps;
  
  const rideIntervalFn = () => {
    if (step < totalArriveSteps) {
      driverLat += stepLatDiff;
      driverLng += stepLngDiff;
      const heading = calculateBearing(driverLat - stepLatDiff, driverLng - stepLngDiff, driverLat, driverLng);
      state.mapAdapter.addMarker(driverLat, driverLng, 'driver', { rotation: heading });
      step++;
      
      const remain = Math.max(1, Math.round(vehicle.eta * (1 - step / totalArriveSteps)));
      etaText.textContent = `Arriving in ${remain} min`;
    } 
    else if (step === totalArriveSteps) {
      statusTitle.textContent = "Driver has arrived";
      statusDesc.textContent = `Verify OTP ${otp} and board your ride.`;
      etaText.textContent = "Arrived";
      distText.textContent = "At pickup";
      step++;
    } 
    else {
      const coordIdx = step - (totalArriveSteps + 1);
      
      if (coordIdx < numCoords) {
        const currentCoord = coords[coordIdx];
        const nextCoord = coords[Math.min(numCoords - 1, coordIdx + 1)];
        
        const heading = calculateBearing(currentCoord[0], currentCoord[1], nextCoord[0], nextCoord[1]);
        state.mapAdapter.addMarker(currentCoord[0], currentCoord[1], 'driver', { rotation: heading });
        
        state.mapAdapter.setView(currentCoord[0], currentCoord[1], 14);
        
        if (state.intermediateStop && !hasReachedStop && coordIdx === stopCoordIdx) {
          statusTitle.textContent = "Reached Stop";
          statusDesc.textContent = `Waiting at ${state.intermediateStop.name.split(',')[0]}...`;
          clearInterval(state.activeRideInterval);
          hasReachedStop = true;
          setTimeout(() => {
            state.activeRideInterval = setInterval(rideIntervalFn, 1000);
          }, 4000);
          step++;
          return;
        }

        if (state.intermediateStop && !hasReachedStop && coordIdx < stopCoordIdx) {
          statusTitle.textContent = "Ride in progress";
          statusDesc.textContent = `Heading to ${state.intermediateStop.name.split(',')[0]}`;
        } else {
          statusTitle.textContent = "Ride in progress";
          statusDesc.textContent = `Heading to ${state.destination.name.split(',')[0]}`;
        }
        
        const progressPercent = Math.round((coordIdx / numCoords) * 100);
        progressBar.style.width = `${progressPercent}%`;
        
        const remainingDist = (state.route.distance * (1 - coordIdx / numCoords)).toFixed(1);
        const remainingTime = Math.max(1, Math.round(state.route.duration * (1 - coordIdx / numCoords)));
        
        distText.textContent = `${remainingDist} km remaining`;
        etaText.textContent = `ETA: ${remainingTime} mins`;
        
        step++;
      } else {
        clearInterval(state.activeRideInterval);
        completeRide();
      }
    }
  };

  state.activeRideInterval = setInterval(rideIntervalFn, 1000);
}

// STEP 5: Ride Completed Flow
function completeRide() {
  clearInterval(state.activeRideInterval);
  state.mapAdapter.removeMarker('driver');
  
  const vehicle = state.selectedVehicle;
  document.getElementById('receipt-fare').textContent = `₹${vehicle.price.toFixed(2)}`;
  document.getElementById('receipt-distance').textContent = `${state.route.distance} km`;
  document.getElementById('receipt-duration').textContent = `${state.route.duration} min`;
  
  showPanelStep('completed');
}

// =============================================
// Along-the-Route Discovery UI & Logic Handlers
// =============================================

function openDiscovery() {
  const drawer = document.getElementById('discovery-drawer');
  if (!drawer) return;
  drawer.classList.add('open');
  state.discoveryOpen = true;
  
  const arrow = document.querySelector('#discovery-trigger-btn .discovery-trigger-arrow i');
  if (arrow && window.lucide) {
    arrow.setAttribute('data-lucide', 'chevron-down');
    window.lucide.createIcons();
  }
}

function closeDiscovery() {
  const drawer = document.getElementById('discovery-drawer');
  if (!drawer) return;
  drawer.classList.remove('open');
  state.discoveryOpen = false;
  
  const arrow = document.querySelector('#discovery-trigger-btn .discovery-trigger-arrow i');
  if (arrow && window.lucide) {
    arrow.setAttribute('data-lucide', 'chevron-right');
    window.lucide.createIcons();
  }
}

function getCategoryEmoji(category) {
  const emojiMap = {
    'florist': '🌸',
    'cafe': '☕',
    'restaurant': '🍽️',
    'pharmacy': '💊',
    'grocery': '🛒',
    'gift': '🎁'
  };
  return emojiMap[category] || '📍';
}

async function searchCategory(category) {
  const resultsContainer = document.getElementById('poi-results-container');
  if (!resultsContainer) return;
  
  // Render loading state skeleton
  resultsContainer.innerHTML = `
    <div class="poi-loading">
      <div class="poi-skeleton"></div>
      <div class="poi-skeleton"></div>
      <div class="poi-skeleton"></div>
    </div>
  `;
  
  // Update category pills UI active state
  document.querySelectorAll('.category-pill').forEach(pill => {
    if (pill.dataset.category === category) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  });
  
  if (!state.originalRoute || !state.originalRoute.coordinates) {
    resultsContainer.innerHTML = `
      <div class="poi-empty-state">
        <div class="empty-icon">😢</div>
        <div>No route found. Please set your pickup and destination.</div>
      </div>
    `;
    return;
  }
  
  try {
    const pois = await state.mapAdapter.searchPOIsAlongRoute(state.originalRoute.coordinates, category);
    
    if (pois.length === 0) {
      resultsContainer.innerHTML = `
        <div class="poi-empty-state">
          <div class="empty-icon">😢</div>
          <div>No spots found along this route. Try another category!</div>
        </div>
      `;
      return;
    }
    
    resultsContainer.innerHTML = '';
    pois.forEach(poi => {
      const card = document.createElement('div');
      card.className = 'poi-result-card';
      card.innerHTML = `
        <div class="poi-icon-container">
          ${getCategoryEmoji(poi.category)}
        </div>
        <div class="poi-details">
          <div class="poi-name" title="${poi.name}">${poi.name}</div>
          <div class="poi-distance-text">${poi.distanceFromRoute} km from route</div>
        </div>
        <div class="detour-badge">
          <i data-lucide="clock"></i> <span>+${poi.estimatedDetourMin} min</span>
        </div>
        <button class="poi-add-btn" title="Add stop">
          <i data-lucide="plus"></i>
        </button>
      `;
      
      const addStopHandler = async (e) => {
        e.stopPropagation();
        await addIntermediateStop(poi);
      };
      
      card.querySelector('.poi-add-btn').addEventListener('click', addStopHandler);
      card.addEventListener('click', addStopHandler);
      
      resultsContainer.appendChild(card);
    });
    
    if (window.lucide) {
      window.lucide.createIcons();
    }
  } catch (err) {
    console.error("POI search error:", err);
    resultsContainer.innerHTML = `
      <div class="poi-empty-state">
        <div class="empty-icon">⚠️</div>
        <div>Search failed. Please try again.</div>
      </div>
    `;
  }
}

async function addIntermediateStop(poi) {
  const badge = document.getElementById('provider-badge');
  const badgeText = document.getElementById('provider-text');
  badgeText.textContent = "Adding stop & recalculating route...";
  badge.style.display = "flex";
  
  try {
    const multiStopRoute = await state.mapAdapter.getMultiStopRoute(
      state.pickup.lat, state.pickup.lng,
      poi.lat, poi.lng,
      state.destination.lat, state.destination.lng
    );
    
    state.intermediateStop = {
      name: poi.name,
      lat: poi.lat,
      lng: poi.lng,
      detourMin: poi.estimatedDetourMin
    };
    state.route = multiStopRoute;
    
    // Clear and redraw stop markers
    state.mapAdapter.removeAllStopMarkers();
    state.mapAdapter.addStopMarker(poi.lat, poi.lng, `Stop: ${poi.name}`);
    
    state.mapAdapter.drawRoute(multiStopRoute.coordinates);
    
    document.getElementById('summary-distance').textContent = `${multiStopRoute.distance} km`;
    document.getElementById('summary-duration').textContent = `${multiStopRoute.duration} mins`;
    
    const bannerName = document.getElementById('stop-banner-name');
    const bannerDetour = document.querySelector('#stop-banner-detour span');
    const stopBanner = document.getElementById('stop-added-banner');
    
    if (bannerName) bannerName.textContent = poi.name;
    if (bannerDetour) bannerDetour.textContent = `+${poi.estimatedDetourMin} min detour`;
    if (stopBanner) stopBanner.classList.add('visible');
    
    const summaryStop = document.getElementById('route-summary-stop');
    const summaryStopName = document.getElementById('route-summary-stop-name');
    if (summaryStopName) summaryStopName.textContent = poi.name;
    if (summaryStop) summaryStop.classList.add('visible');
    
    const triggerBtn = document.getElementById('discovery-trigger-btn');
    if (triggerBtn) triggerBtn.style.display = 'none';
    
    closeDiscovery();
    renderVehicleOptions();
    
    badgeText.textContent = `Map Engine • Connected`;
  } catch (err) {
    console.error("Failed to add stop:", err);
    alert("Could not calculate route through this stop. Please select another stop.");
    badgeText.textContent = "Routing Failed";
  }
}

function removeIntermediateStop() {
  if (!state.originalRoute) return;
  
  state.intermediateStop = null;
  state.route = state.originalRoute;
  
  state.mapAdapter.removeAllStopMarkers();
  state.mapAdapter.drawRoute(state.originalRoute.coordinates);
  
  document.getElementById('summary-distance').textContent = `${state.originalRoute.distance} km`;
  document.getElementById('summary-duration').textContent = `${state.originalRoute.duration} mins`;
  
  const stopBanner = document.getElementById('stop-added-banner');
  if (stopBanner) stopBanner.classList.remove('visible');
  
  const summaryStop = document.getElementById('route-summary-stop');
  if (summaryStop) summaryStop.classList.remove('visible');
  
  const triggerBtn = document.getElementById('discovery-trigger-btn');
  if (triggerBtn) triggerBtn.style.display = 'flex';
  
  document.querySelectorAll('.category-pill').forEach(pill => pill.classList.remove('active'));
  const resultsContainer = document.getElementById('poi-results-container');
  if (resultsContainer) {
    resultsContainer.innerHTML = `
      <div class="poi-empty-state">
        <div class="empty-icon">🗺️</div>
        <div>Select a category above to find spots along your route</div>
      </div>
    `;
  }
  
  renderVehicleOptions();
}

// Cancel Booking/Ride and reset map state
function resetRideState() {
  clearInterval(state.activeRideInterval);
  state.mapAdapter.removeMarker('driver');
  state.mapAdapter.removeMarker('pickup');
  state.mapAdapter.removeMarker('destination');
  state.mapAdapter.clearRoute();
  
  if (state.mapAdapter.removeAllStopMarkers) {
    state.mapAdapter.removeAllStopMarkers();
  }
  
  document.getElementById('pickup-input').value = '';
  document.getElementById('destination-input').value = '';
  document.getElementById('clear-pickup-btn').style.display = 'none';
  document.getElementById('clear-dest-btn').style.display = 'none';
  
  state.pickup = { name: '', lat: null, lng: null };
  state.destination = { name: '', lat: null, lng: null };
  state.route = null;
  state.originalRoute = null;
  state.intermediateStop = null;
  state.selectedVehicle = null;
  
  const stopBanner = document.getElementById('stop-added-banner');
  if (stopBanner) stopBanner.classList.remove('visible');
  const summaryStop = document.getElementById('route-summary-stop');
  if (summaryStop) summaryStop.classList.remove('visible');
  const triggerBtn = document.getElementById('discovery-trigger-btn');
  if (triggerBtn) triggerBtn.style.display = 'flex';
  closeDiscovery();
  
  state.mapAdapter.setView(12.9716, 77.5946, 12);
  
  resetSlideButton();
  showPanelStep('search');
}

// Main initialization function
async function initApp() {
  const providerText = document.getElementById('provider-text');
  const providerBadge = document.getElementById('provider-badge');

  // 1. Initialize Map
  state.mapAdapter = new MapAdapter('map');
  
  try {
    providerText.textContent = 'Loading Map...';
    await state.mapAdapter.init();
    providerText.textContent = 'Free Map Engine • Connected';
    providerBadge.classList.add('mappls-active');

    // Auto-fill user current location on startup
    if (navigator.geolocation) {
      providerText.textContent = 'Requesting location...';
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          
          try {
            const name = await reverseGeocode(lat, lng);
            if (!state.pickup.lat) {
              setPickupLocation(name, lat, lng);
            }
          } catch (err) {
            if (!state.pickup.lat) {
              setPickupLocation("My Location", lat, lng);
            }
          }
          providerText.textContent = 'Free Map Engine • Connected';
        },
        (error) => {
          console.warn("Auto-geolocation failed or denied, using default:", error);
          if (!state.pickup.lat) {
            setPickupLocation("Vidhana Soudha, Bengaluru", 12.9796, 77.5906);
          }
          providerText.textContent = 'Free Map Engine • Connected';
        }
      );
    } else {
      if (!state.pickup.lat) {
        setPickupLocation("Vidhana Soudha, Bengaluru", 12.9796, 77.5906);
      }
    }
  } catch (err) {
    console.error(err);
    providerText.textContent = 'Map Load Error';
    providerBadge.classList.remove('mappls-active');
  }

  // 2. User Geolocation (Locate Me)
  const locateMeBtn = document.getElementById('locate-me-btn');
  locateMeBtn.addEventListener('click', () => {
    if (navigator.geolocation) {
      providerText.textContent = 'Locating user...';
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          state.mapAdapter.setView(lat, lng, 14);
          
          try {
            const name = await reverseGeocode(lat, lng);
            setPickupLocation(name, lat, lng);
          } catch (err) {
            setPickupLocation("My Location", lat, lng);
          }
          
          providerText.textContent = 'Free Map Engine • Connected';
        },
        (error) => {
          console.warn("Geolocation failed or denied:", error);
          alert("Could not retrieve location. Defaulting to Central Bengaluru.");
        }
      );
    } else {
      alert("Geolocation is not supported by your browser.");
    }
  });

  // 3. Map Clicks (Optionally select pickup or destination based on active input field)
  state.mapAdapter.onMapClick(async (coords) => {
    if (state.currentStep === 'search') {
      const name = `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
      
      const geocodedName = await reverseGeocode(coords.lat, coords.lng);

      if (state.activeInputField === 'pickup') {
        setPickupLocation(geocodedName, coords.lat, coords.lng);
      } else {
        setDestinationLocation(geocodedName, coords.lat, coords.lng);
      }
    }
  });

  // Helper setters
  const pickupInput = document.getElementById('pickup-input');
  const destInput = document.getElementById('destination-input');
  const clearPickup = document.getElementById('clear-pickup-btn');
  const clearDest = document.getElementById('clear-dest-btn');
  
  function setPickupLocation(name, lat, lng) {
    state.pickup = { name, lat, lng };
    pickupInput.value = name;
    clearPickup.style.display = 'block';
    state.mapAdapter.addMarker(lat, lng, 'pickup', { popupText: 'Pickup: ' + name });
    state.mapAdapter.setView(lat, lng, 14);
    
    if (state.destination.lat) {
      handleRouteCalculation();
    }
  }

  function setDestinationLocation(name, lat, lng) {
    state.destination = { name, lat, lng };
    destInput.value = name;
    clearDest.style.display = 'block';
    state.mapAdapter.addMarker(lat, lng, 'destination', { popupText: 'Destination: ' + name });
    
    if (state.pickup.lat) {
      handleRouteCalculation();
    } else {
      alert("Please enter a pickup location first!");
    }
  }

  // 4. Autocomplete Input Handling with Debouncing
  const pickupSuggestions = document.getElementById('pickup-suggestions');
  const destSuggestions = document.getElementById('destination-suggestions');

  const handleAutocomplete = async (inputVal, type) => {
    const suggestionsList = type === 'pickup' ? pickupSuggestions : destSuggestions;
    
    if (!inputVal || inputVal.trim().length < 3) {
      suggestionsList.classList.add('hidden');
      return;
    }

    const results = await state.mapAdapter.searchPlaces(inputVal);
    
    if (results.length === 0) {
      suggestionsList.classList.add('hidden');
      return;
    }

    suggestionsList.innerHTML = '';
    suggestionsList.classList.remove('hidden');

    results.forEach(place => {
      const item = document.createElement('div');
      item.className = 'suggestion-item';
      item.innerHTML = `
        <i data-lucide="map-pin"></i>
        <div class="suggestion-details">
          <p class="suggestion-title">${place.name}</p>
          <p class="suggestion-subtitle">${place.subname}</p>
        </div>
      `;
      
      item.addEventListener('click', () => {
        if (type === 'pickup') {
          setPickupLocation(place.name, place.lat, place.lng);
          pickupSuggestions.classList.add('hidden');
        } else {
          setDestinationLocation(place.name, place.lat, place.lng);
          destSuggestions.classList.add('hidden');
        }
      });
      
      suggestionsList.appendChild(item);
    });

    if (window.lucide) {
      window.lucide.createIcons();
    }
  };

  const debouncedPickup = debounce((val) => handleAutocomplete(val, 'pickup'), 300);
  const debouncedDest = debounce((val) => handleAutocomplete(val, 'destination'), 300);

  pickupInput.addEventListener('input', (e) => {
    state.pickup = { name: e.target.value, lat: null, lng: null };
    state.mapAdapter.removeMarker('pickup');
    state.mapAdapter.clearRoute();
    state.route = null;
    
    clearPickup.style.display = e.target.value ? 'block' : 'none';
    debouncedPickup(e.target.value);
  });
  
  destInput.addEventListener('input', (e) => {
    state.destination = { name: e.target.value, lat: null, lng: null };
    state.mapAdapter.removeMarker('destination');
    state.mapAdapter.clearRoute();
    state.route = null;
    
    clearDest.style.display = e.target.value ? 'block' : 'none';
    debouncedDest(e.target.value);
  });

  pickupInput.addEventListener('focus', () => {
    state.activeInputField = 'pickup';
    if (pickupSuggestions.children.length > 0 && pickupInput.value.trim().length >= 3) {
      pickupSuggestions.classList.remove('hidden');
    }
  });

  destInput.addEventListener('focus', () => {
    state.activeInputField = 'destination';
    if (destSuggestions.children.length > 0 && destInput.value.trim().length >= 3) {
      destSuggestions.classList.remove('hidden');
    }
  });

  // Clear button events
  clearPickup.addEventListener('click', () => {
    pickupInput.value = '';
    clearPickup.style.display = 'none';
    pickupSuggestions.classList.add('hidden');
    state.mapAdapter.removeMarker('pickup');
    state.mapAdapter.clearRoute();
    state.route = null;
    state.pickup = { name: '', lat: null, lng: null };
  });

  clearDest.addEventListener('click', () => {
    destInput.value = '';
    clearDest.style.display = 'none';
    destSuggestions.classList.add('hidden');
    state.mapAdapter.removeMarker('destination');
    state.mapAdapter.clearRoute();
    state.route = null;
    state.destination = { name: '', lat: null, lng: null };
  });

  // Hide suggestions when clicking outside
  document.addEventListener('click', (e) => {
    if (!pickupInput.contains(e.target) && !pickupSuggestions.contains(e.target)) {
      pickupSuggestions.classList.add('hidden');
    }
    if (!destInput.contains(e.target) && !destSuggestions.contains(e.target)) {
      destSuggestions.classList.add('hidden');
    }
  });

  // Recent / Quick destinations selection
  document.querySelectorAll('.quick-item').forEach(item => {
    item.addEventListener('click', () => {
      const name = item.dataset.name;
      const lat = parseFloat(item.dataset.lat);
      const lng = parseFloat(item.dataset.lng);
      
      // If we were focused on pickup input, set the pickup location
      if (state.activeInputField === 'pickup') {
        setPickupLocation(name, lat, lng);
      } else {
        // Otherwise, set destination (and auto-fill pickup to Vidhana Soudha if not set)
        if (!state.pickup.lat) {
          setPickupLocation("Vidhana Soudha, Bengaluru", 12.9796, 77.5906);
        }
        setDestinationLocation(name, lat, lng);
      }
    });
  });

  // 5. Setup flow buttons
  document.getElementById('back-to-search').addEventListener('click', () => {
    state.mapAdapter.clearRoute();
    state.mapAdapter.removeMarker('driver');
    if (state.mapAdapter.removeAllStopMarkers) {
      state.mapAdapter.removeAllStopMarkers();
    }
    state.intermediateStop = null;
    state.originalRoute = null;
    const stopBanner = document.getElementById('stop-added-banner');
    if (stopBanner) stopBanner.classList.remove('visible');
    const summaryStop = document.getElementById('route-summary-stop');
    if (summaryStop) summaryStop.classList.remove('visible');
    const triggerBtn = document.getElementById('discovery-trigger-btn');
    if (triggerBtn) triggerBtn.style.display = 'flex';
    closeDiscovery();
    
    resetSlideButton();
    showPanelStep('search');
  });

  document.getElementById('cancel-matching-btn').addEventListener('click', () => {
    resetSlideButton();
    showPanelStep('select-ride');
  });

  document.getElementById('cancel-trip-btn').addEventListener('click', () => {
    const yes = confirm("Are you sure you want to cancel your ride?");
    if (yes) {
      resetRideState();
    }
  });

  document.getElementById('finish-ride-btn').addEventListener('click', () => {
    resetRideState();
  });

  // Setup stars rating interactions
  document.querySelectorAll('.star-btn').forEach(star => {
    star.addEventListener('click', () => {
      const rating = parseInt(star.dataset.rating);
      document.querySelectorAll('.star-btn').forEach(s => {
        const r = parseInt(s.dataset.rating);
        if (r <= rating) {
          s.classList.add('filled');
        } else {
          s.classList.remove('filled');
        }
      });
    });
  });

  // Setup slide gesture confirmation
  setupSlideConfirm();
  
  // 6. Along-the-Route Discovery Event Listeners
  const triggerBtn = document.getElementById('discovery-trigger-btn');
  const closeBtn = document.getElementById('discovery-close-btn');
  const stopRemoveBtn = document.getElementById('stop-remove-btn');
  
  if (triggerBtn) {
    triggerBtn.addEventListener('click', () => {
      if (state.discoveryOpen) {
        closeDiscovery();
      } else {
        openDiscovery();
      }
    });
  }
  
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      closeDiscovery();
    });
  }
  
  if (stopRemoveBtn) {
    stopRemoveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeIntermediateStop();
    });
  }
  
  // Category Pill Clicks
  document.querySelectorAll('.category-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const category = pill.dataset.category;
      searchCategory(category);
    });
  });
  
  // Set initial step layout view
  showPanelStep('search');

  // Trigger Lucide on load
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Start application
window.addEventListener('DOMContentLoaded', initApp);
