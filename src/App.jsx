import { useState, useEffect } from 'react';
import './App.css';

// --- CONFIGURATION ---
const SUBWAY_FILTERS = [
  'Red', 'Orange', 'Blue',
  'Green-B', 'Green-C', 'Green-D', 'Green-E',
  'Mattapan',
  '741', '742', '743', '751', '749' // Silver Line
];

// --- HOOK: Manage Favorites ---
const useFavorites = () => {
  const [favorites, setFavorites] = useState([]);
  useEffect(() => {
    const saved = localStorage.getItem('mbta_favorites');
    if (saved) setFavorites(JSON.parse(saved));
  }, []);

  const toggleFavorite = (stop, route) => {
    let newFavorites;
    const exists = favorites.find(f => f.stopId === stop.id);
    if (exists) {
      newFavorites = favorites.filter(f => f.stopId !== stop.id);
    } else {
      newFavorites = [...favorites, { 
        stopId: stop.id, 
        stopName: stop.attributes.name, 
        routeId: route.id,
        routeName: route.attributes.long_name || route.id 
      }];
    }
    setFavorites(newFavorites);
    localStorage.setItem('mbta_favorites', JSON.stringify(newFavorites));
  };

  const isFavorite = (stopId) => favorites.some(f => f.stopId === stopId);
  return { favorites, toggleFavorite, isFavorite };
};

// --- HOOK: MBTA Data ---
const useMbtaData = () => {
  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState([]);
  const [predictionGroups, setPredictionGroups] = useState([]);
  const [vehicles, setVehicles] = useState([]); // <--- NEW: For Map
  const [loading, setLoading] = useState(false);

  const normalizeName = (name) => {
    if (!name) return "";
    return name.toLowerCase().replace("street", "st").replace(/\s+/g, '').trim();
  };

  const isNewTrain = (routeId, label) => {
    if (routeId !== 'Red' || !label) return false;
    const carNumber = parseInt(label.split('-')[0], 10);
    return !isNaN(carNumber) && carNumber >= 1900;
  };

  // 1. Fetch Routes
  useEffect(() => {
    const fetchRoutes = async () => {
      try {
        const response = await fetch('https://api-v3.mbta.com/routes?filter[type]=0,1,3');
        const json = await response.json();
        const filteredRoutes = json.data.filter(r => SUBWAY_FILTERS.includes(r.id));
        filteredRoutes.sort((a, b) => a.attributes.sort_order - b.attributes.sort_order);
        setRoutes(filteredRoutes);
      } catch (err) {
        console.error("Failed routes", err);
      }
    };
    fetchRoutes();
  }, []);

  // 2. Fetch Stops
  const fetchStops = async (routeId) => {
    setLoading(true);
    setStops([]);
    setPredictionGroups([]);
    try {
      const response = await fetch(`https://api-v3.mbta.com/stops?filter[route]=${routeId}`);
      const json = await response.json();
      return json.data; // Return data for immediate use
    } catch (err) {
      console.error(err);
      return [];
    } finally {
      setLoading(false);
    }
  };

  // 3. Fetch Predictions (Arrivals)
  const fetchPredictions = async (routeId, stopId, currentStopsList = stops) => {
    try {
      const currentStop = currentStopsList.find(s => s.id === stopId);
      const currentStopNameNorm = currentStop ? normalizeName(currentStop.attributes.name) : "";

      const response = await fetch(
        `https://api-v3.mbta.com/predictions?filter[stop]=${stopId}&filter[route]=${routeId}&sort=arrival_time&include=trip,vehicle`
      );
      const json = await response.json();
      const now = new Date();
      
      const tripMap = {};
      const vehicleMap = {};
      if (json.included) {
        json.included.forEach(item => {
          if (item.type === 'trip') tripMap[item.id] = item.attributes.headsign;
          if (item.type === 'vehicle') vehicleMap[item.id] = item.attributes.label;
        });
      }

      const groups = {};
      json.data.forEach((pred) => {
        const arrivalTime = new Date(pred.attributes.arrival_time || pred.attributes.departure_time);
        if (arrivalTime > now) {
          const diffMs = arrivalTime - now;
          const minutes = Math.floor(diffMs / 60000);
          
          const tripId = pred.relationships?.trip?.data?.id;
          const vehicleId = pred.relationships?.vehicle?.data?.id;
          let headsign = tripMap[tripId] || pred.attributes.headsign || "Train";
          let carLabel = vehicleMap[vehicleId];

          if (headsign === "Green Line D") headsign = "Riverside"; 
          if (headsign === "Green Line E") headsign = "Heath St";
          if (normalizeName(headsign) === currentStopNameNorm) return; 

          if (!groups[headsign]) {
            groups[headsign] = { name: headsign, directionId: pred.attributes.direction_id, trains: [] };
          }
          groups[headsign].trains.push({
            id: pred.id,
            minutes: minutes < 1 ? "Now" : `${minutes} min`,
            status: pred.attributes.status,
            isNew: isNewTrain(routeId, carLabel)
          });
        }
      });

      const finalGroups = Object.values(groups)
        .map(group => ({
          ...group,
          trains: group.trains.sort((a, b) => (a.minutes === "Now" ? -1 : parseInt(a.minutes) - parseInt(b.minutes)))
        }))
        .sort((a, b) => a.directionId - b.directionId || a.name.localeCompare(b.name));

      setPredictionGroups(finalGroups);
    } catch (err) {
      console.error(err);
    }
  };

  // 4. Fetch Vehicles (For Map) - FIXED PARENT STATION LOGIC
  const fetchVehicles = async (routeId, directionId) => {
    try {
      // We include 'stop' so we can look up the Parent Station ID
      const response = await fetch(
        `https://api-v3.mbta.com/vehicles?filter[route]=${routeId}&include=stop`
      );
      const json = await response.json();
      
      // 1. Build a lookup map: Child Platform ID -> Parent Station ID
      // (e.g. "70080" -> "place-sstat")
      const stopParentMap = {};
      if (json.included) {
        json.included.forEach(item => {
          if (item.type === 'stop') {
            const parentId = item.relationships?.parent_station?.data?.id;
            // If it has a parent, map it. If not, use its own ID.
            stopParentMap[item.id] = parentId || item.id;
          }
        });
      }

      const activeTrains = json.data
        .filter(v => v.attributes.direction_id === directionId)
        .map(v => {
          const rawStopId = v.relationships?.stop?.data?.id;
          // Use the map to translate "Platform ID" to "Parent ID"
          const parentStationId = stopParentMap[rawStopId] || rawStopId;

          return {
            id: v.id,
            status: v.attributes.current_status,
            stopId: parentStationId, // Now this matches your Map stops!
            label: v.attributes.label,
            isNew: isNewTrain(routeId, v.attributes.label)
          };
        });

      setVehicles(activeTrains);
    } catch (err) {
      console.error("Failed to fetch vehicles", err);
    }
  };

  return { 
    routes, setStops, stops, predictionGroups, vehicles, 
    fetchStops, fetchPredictions, fetchVehicles, loading 
  };
};

const getLineColor = (routeId) => {
  if (!routeId) return '#003da5'; 
  const id = routeId.toLowerCase();
  if (id.includes('red') || id === 'mattapan') return '#da291c';
  if (id.includes('orange')) return '#ed8b00';
  if (id.includes('blue')) return '#003da5';
  if (id.includes('green')) return '#00843d';
  if (id.includes('74') || id.includes('75')) return '#7c878e'; 
  return '#003da5';
};


// --- MAP HELPERS ---
const RED_LINE_ASHMONT = ['place-shmnl', 'place-fldcr', 'place-smmnl', 'place-asmnl'];
const RED_LINE_BRAINTREE = ['place-nqncy', 'place-wlsta', 'place-qnctr', 'place-qamnl', 'place-brntn'];

// Reusable component for a single stop row
const MapStopRow = ({ stop, vehicles }) => {
  const trainsHere = vehicles.filter(v => v.stopId === stop.id);
  
  return (
    <div className="map-stop-row">
      <div className="map-marker-area">
        <div className="stop-dot"></div>
        {trainsHere.map(train => (
          <div key={train.id} className={`train-marker ${train.status === 'IN_TRANSIT_TO' ? 'moving' : ''}`}>
             <span className="train-icon">{train.isNew ? "✨" : "🚇"}</span>
          </div>
        ))}
      </div>
      <div className="map-stop-name">{stop.attributes.name}</div>
    </div>
  );
};

// --- SUB-COMPONENT: MAP VIEW ---
const MapView = ({ route, stops, vehicles, onDirectionChange, directionId }) => {
  if (!route) return <div className="no-selection-msg">Please select a line above</div>;

  // FIX: Mattapan should NOT use the Red Line branch logic. 
  // It is a simple line, so we strictly check for "Red" here.
  const isRedLine = route.id === 'Red';

  // --- RED LINE SPECIFIC LOGIC ---
  const renderRedLine = () => {
    // 1. Split stops into segments
    const trunkStops = [];
    const ashmontStops = [];
    const braintreeStops = [];

    stops.forEach(stop => {
      if (RED_LINE_ASHMONT.includes(stop.id)) {
        ashmontStops.push(stop);
      } else if (RED_LINE_BRAINTREE.includes(stop.id)) {
        braintreeStops.push(stop);
      } else {
        trunkStops.push(stop);
      }
    });

    // 2. Handle Direction Reversing
    const isOutbound = directionId === 0;

    const orderedTrunk = isOutbound ? trunkStops : [...trunkStops].reverse();
    const orderedAshmont = isOutbound ? ashmontStops : [...ashmontStops].reverse();
    const orderedBraintree = isOutbound ? braintreeStops : [...braintreeStops].reverse();

    return (
      <div className="thermometer red-line-layout">
        {/* Inbound: Branches First */}
        {!isOutbound && (
          <div className="branches-container">
            <div className="branch-column">
              <div className="branch-label">Ashmont</div>
              <div className="thermometer-line"></div>
              {orderedAshmont.map(stop => <MapStopRow key={stop.id} stop={stop} vehicles={vehicles} />)}
            </div>
            <div className="branch-column">
              <div className="branch-label">Braintree</div>
              <div className="thermometer-line"></div>
              {orderedBraintree.map(stop => <MapStopRow key={stop.id} stop={stop} vehicles={vehicles} />)}
            </div>
          </div>
        )}

        {/* Trunk (Middle) */}
        <div className="trunk-container">
          <div className={`trunk-line ${!isOutbound ? 'merge-up' : 'split-down'}`}></div>
          {orderedTrunk.map(stop => <MapStopRow key={stop.id} stop={stop} vehicles={vehicles} />)}
        </div>

        {/* Outbound: Branches Last */}
        {isOutbound && (
          <div className="branches-container top-connector">
            <div className="branch-column">
              <div className="branch-label">Ashmont</div>
              <div className="thermometer-line"></div>
              {orderedAshmont.map(stop => <MapStopRow key={stop.id} stop={stop} vehicles={vehicles} />)}
            </div>
            <div className="branch-column">
              <div className="branch-label">Braintree</div>
              <div className="thermometer-line"></div>
              {orderedBraintree.map(stop => <MapStopRow key={stop.id} stop={stop} vehicles={vehicles} />)}
            </div>
          </div>
        )}
      </div>
    );
  };

  // --- STANDARD LOGIC (Orange, Blue, Green, Mattapan) ---
  const renderStandardLine = () => {
    // Simple reverse for Inbound
    const displayStops = directionId === 1 ? [...stops].reverse() : stops;
    
    return (
      <div className="thermometer">
        <div className="thermometer-line main-line"></div>
        {displayStops.map(stop => (
          <MapStopRow key={stop.id} stop={stop} vehicles={vehicles} />
        ))}
      </div>
    );
  };

  return (
    <div className="map-container fade-in">
      <div className="direction-toggle">
        <label>Direction</label>
        <div className="toggle-row">
          <button className={directionId === 0 ? "active" : ""} onClick={() => onDirectionChange(0)}>
            {route.attributes.direction_names[0]}
          </button>
          <button className={directionId === 1 ? "active" : ""} onClick={() => onDirectionChange(1)}>
            {route.attributes.direction_names[1]}
          </button>
        </div>
      </div>

      {isRedLine ? renderRedLine() : renderStandardLine()}
    </div>
  );
};

// --- MAIN APP ---
function App() {
  const { 
    routes, setStops, stops, predictionGroups, vehicles, 
    fetchStops, fetchPredictions, fetchVehicles, loading 
  } = useMbtaData();
  const { favorites, toggleFavorite, isFavorite } = useFavorites();
  
  const [currentTab, setCurrentTab] = useState('list'); // 'list' or 'map'
  
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [selectedStop, setSelectedStop] = useState(null);
  const [mapDirection, setMapDirection] = useState(0); // 0 or 1

  // Polling Logic
  useEffect(() => {
    let intervalId;
    const poll = () => {
      // If List View
      if (currentTab === 'list' && selectedRoute && selectedStop) {
        fetchPredictions(selectedRoute.id, selectedStop.id);
      }
      // If Map View
      if (currentTab === 'map' && selectedRoute) {
        fetchVehicles(selectedRoute.id, mapDirection);
      }
    };

    poll(); // Initial run
    intervalId = setInterval(poll, 4000); // 4s refresh

    return () => clearInterval(intervalId);
  }, [currentTab, selectedRoute, selectedStop, mapDirection]);

  // Handlers
  const handleRouteSelect = async (e) => {
    const routeId = e.target.value;
    const routeObj = routes.find(r => r.id === routeId);
    setSelectedRoute(routeObj);
    setSelectedStop(null);
    if (routeId) {
      const newStops = await fetchStops(routeId);
      setStops(newStops);
    }
  };

  const handleStopSelect = (e) => {
    const stopId = e.target.value;
    const stopObj = stops.find(s => s.id === stopId);
    setSelectedStop(stopObj);
  };

  const handleFavoriteClick = async (fav) => {
    setCurrentTab('list'); // Force switch to list
    const routeObj = routes.find(r => r.id === fav.routeId);
    if (!routeObj) return;
    setSelectedRoute(routeObj);
    const fetchedStops = await fetchStops(fav.routeId);
    setStops(fetchedStops); // Important: Update stops state so map works too
    const stopObj = fetchedStops.find(s => s.id === fav.stopId);
    if (stopObj) {
      setSelectedStop(stopObj);
      fetchPredictions(fav.routeId, fav.stopId, fetchedStops);
    }
  };

  const lineColor = getLineColor(selectedRoute?.id);

  return (
    <div className="app-container" style={{ '--line-color': lineColor }}>
      <header><h1>Boston T Tracker</h1></header>

      {/* --- FAVORITES (Only on List View) --- */}
      {currentTab === 'list' && favorites.length > 0 && (
        <div className="favorites-container">
          <div className="favorites-label">QUICK ACCESS</div>
          <div className="favorites-list">
            {favorites.map(fav => (
              <button 
                key={fav.stopId} 
                className="fav-chip"
                onClick={() => handleFavoriteClick(fav)}
                style={{ '--chip-color': getLineColor(fav.routeId) }}
              >
                <span className="fav-route-dot"></span>
                {fav.stopName}
              </button>
            ))}
          </div>
        </div>
      )}

      <main className="main-content">
        {/* --- COMMON: Line Selector --- */}
        <div className="selector-group">
          <label>Select Line</label>
          <select onChange={handleRouteSelect} value={selectedRoute?.id || ""}>
            <option value="" disabled>-- Choose a Line --</option>
            {routes.map(route => (
              <option key={route.id} value={route.id}>{route.attributes.long_name}</option>
            ))}
          </select>
        </div>

        {/* --- TAB CONTENT SWITCHER --- */}
        {currentTab === 'list' ? (
          <>
            {selectedRoute && (
              <div className="selector-group slide-in">
                <label>Select Station</label>
                <select onChange={handleStopSelect} value={selectedStop?.id || ""}>
                  <option value="" disabled>-- Choose a Station --</option>
                  {stops.map(stop => (
                    <option key={stop.id} value={stop.id}>{stop.attributes.name}</option>
                  ))}
                </select>
              </div>
            )}

            {selectedStop && (
              <div className="predictions-container slide-in">
                <div className="predictions-header">
                  <h2>
                    {selectedStop.attributes.name}
                    <button className="star-btn" onClick={() => toggleFavorite(selectedStop, selectedRoute)}>
                      {isFavorite(selectedStop.id) ? "★" : "☆"}
                    </button>
                  </h2>
                  <div className="live-indicator">{loading ? "..." : "Live"}</div>
                </div>

                <div className="destinations-list">
                  {predictionGroups.length === 0 ? <p className="no-data">No trains predicted</p> : 
                    predictionGroups.map(group => (
                      <div key={group.name} className="destination-card">
                        <h3>To {group.name}</h3>
                        <div className="train-row-container">
                          {group.trains.map(t => (
                            <div key={t.id} className="train-pill">
                              <span className="time">
                                {t.minutes}
                                {t.isNew && <span className="new-badge">✨</span>}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </>
        ) : (
          /* --- MAP TAB --- */
          <MapView 
            route={selectedRoute} 
            stops={stops} 
            vehicles={vehicles}
            directionId={mapDirection}
            onDirectionChange={setMapDirection}
          />
        )}
      </main>

      {/* --- BOTTOM NAVIGATION BAR --- */}
      <nav className="bottom-nav">
        <button 
          className={`nav-item ${currentTab === 'list' ? 'active' : ''}`}
          onClick={() => setCurrentTab('list')}
        >
          <span className="nav-icon">📋</span>
          <span className="nav-label">Arrivals</span>
        </button>
        <button 
          className={`nav-item ${currentTab === 'map' ? 'active' : ''}`}
          onClick={() => setCurrentTab('map')}
        >
          <span className="nav-icon">🗺️</span>
          <span className="nav-label">Map</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
