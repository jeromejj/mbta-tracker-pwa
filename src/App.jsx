import { useState, useEffect } from 'react';
import MapView from './MapView'; // <--- IMPORT THE NEW FILE
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
  const [vehicles, setVehicles] = useState([]); 
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
      return json.data; 
    } catch (err) {
      console.error(err);
      return [];
    } finally {
      setLoading(false);
    }
  };

  // 3. Fetch Predictions
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

  // 4. Fetch Vehicles (With Parent Station Fix)
  const fetchVehicles = async (routeId, directionId) => {
    try {
      const response = await fetch(
        `https://api-v3.mbta.com/vehicles?filter[route]=${routeId}&include=stop`
      );
      const json = await response.json();
      
      const stopParentMap = {};
      if (json.included) {
        json.included.forEach(item => {
          if (item.type === 'stop') {
            const parentId = item.relationships?.parent_station?.data?.id;
            stopParentMap[item.id] = parentId || item.id;
          }
        });
      }

      const activeTrains = json.data
        .filter(v => v.attributes.direction_id === directionId)
        .map(v => {
          const rawStopId = v.relationships?.stop?.data?.id;
          const parentStationId = stopParentMap[rawStopId] || rawStopId;

          return {
            id: v.id,
            status: v.attributes.current_status,
            stopId: parentStationId, 
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

// --- HELPER: Colors ---
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

// --- MAIN APP ---
function App() {
  const { 
    routes, setStops, stops, predictionGroups, vehicles, 
    fetchStops, fetchPredictions, fetchVehicles, loading 
  } = useMbtaData();
  const { favorites, toggleFavorite, isFavorite } = useFavorites();
  
  const [currentTab, setCurrentTab] = useState('list');
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [selectedStop, setSelectedStop] = useState(null);
  const [mapDirection, setMapDirection] = useState(0);

  // Polling Logic
  useEffect(() => {
    let intervalId;
    const poll = () => {
      if (currentTab === 'list' && selectedRoute && selectedStop) {
        fetchPredictions(selectedRoute.id, selectedStop.id);
      }
      if (currentTab === 'map' && selectedRoute) {
        fetchVehicles(selectedRoute.id, mapDirection);
      }
    };
    poll(); 
    intervalId = setInterval(poll, 4000); 
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
    setCurrentTab('list');
    const routeObj = routes.find(r => r.id === fav.routeId);
    if (!routeObj) return;
    setSelectedRoute(routeObj);
    const fetchedStops = await fetchStops(fav.routeId);
    setStops(fetchedStops); 
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

      {/* --- FAVORITES --- */}
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
