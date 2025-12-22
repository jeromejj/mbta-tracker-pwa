import { useState, useEffect } from 'react';
import './App.css';

// --- CONFIGURATION ---
const SUBWAY_FILTERS = [
  'Red', 'Orange', 'Blue',
  'Green-B', 'Green-C', 'Green-D', 'Green-E',
  'Mattapan',
  '741', '742', '743', '751', '749' // Silver Line
];

// --- HOOK: Manage Favorites (LocalStorage) ---
const useFavorites = () => {
  const [favorites, setFavorites] = useState([]);

  // Load from local storage on startup
  useEffect(() => {
    const saved = localStorage.getItem('mbta_favorites');
    if (saved) {
      setFavorites(JSON.parse(saved));
    }
  }, []);

  // Save to local storage whenever favorites change
  const toggleFavorite = (stop, route) => {
    let newFavorites;
    const exists = favorites.find(f => f.stopId === stop.id);

    if (exists) {
      // Remove
      newFavorites = favorites.filter(f => f.stopId !== stop.id);
    } else {
      // Add
      newFavorites = [
        ...favorites, 
        { 
          stopId: stop.id, 
          stopName: stop.attributes.name, 
          routeId: route.id,
          routeName: route.attributes.long_name || route.id 
        }
      ];
    }
    
    setFavorites(newFavorites);
    localStorage.setItem('mbta_favorites', JSON.stringify(newFavorites));
  };

  const isFavorite = (stopId) => {
    return favorites.some(f => f.stopId === stopId);
  };

  return { favorites, toggleFavorite, isFavorite };
};

// --- HOOK: MBTA Data (Existing) ---
const useMbtaData = () => {
  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState([]);
  const [predictionGroups, setPredictionGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
        console.error("Failed to fetch routes:", err);
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
      setStops(json.data);
      return json.data; // Return stops so we can use them immediately in the click handler
    } catch (err) {
      setError("Could not load stops.");
      return [];
    } finally {
      setLoading(false);
    }
  };

  // 3. Fetch Predictions
  const fetchPredictions = async (routeId, stopId, currentStopsList = stops) => {
    try {
      // Robustness: Use passed stops list if state isn't updated yet
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
            groups[headsign] = {
              name: headsign,
              directionId: pred.attributes.direction_id,
              trains: []
            };
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

  return { routes, stops, predictionGroups, fetchStops, fetchPredictions, loading };
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

function App() {
  const { routes, stops, predictionGroups, fetchStops, fetchPredictions, loading } = useMbtaData();
  const { favorites, toggleFavorite, isFavorite } = useFavorites();
  
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [selectedStop, setSelectedStop] = useState(null);

  useEffect(() => {
    let intervalId;
    if (selectedRoute && selectedStop) {
      fetchPredictions(selectedRoute.id, selectedStop.id);
      intervalId = setInterval(() => {
        fetchPredictions(selectedRoute.id, selectedStop.id);
      }, 3000);
    }
    return () => { if (intervalId) clearInterval(intervalId); };
  }, [selectedRoute, selectedStop]);

  const handleRouteSelect = (e) => {
    const routeId = e.target.value;
    const routeObj = routes.find(r => r.id === routeId);
    setSelectedRoute(routeObj);
    setSelectedStop(null);
    if (routeId) fetchStops(routeId);
  };

  const handleStopSelect = (e) => {
    const stopId = e.target.value;
    const stopObj = stops.find(s => s.id === stopId);
    setSelectedStop(stopObj);
  };

  // --- NEW: Handle click on a Favorite Chip ---
  const handleFavoriteClick = async (fav) => {
    // 1. Find and set the route object
    const routeObj = routes.find(r => r.id === fav.routeId);
    if (!routeObj) return;
    setSelectedRoute(routeObj);

    // 2. Fetch stops for this route immediately
    // Note: We need the list of stops *now* to find the stop object, 
    // we can't wait for the state to update.
    const fetchedStops = await fetchStops(fav.routeId);

    // 3. Find and set the stop object
    const stopObj = fetchedStops.find(s => s.id === fav.stopId);
    if (stopObj) {
      setSelectedStop(stopObj);
      // 4. Fetch predictions immediately
      fetchPredictions(fav.routeId, fav.stopId, fetchedStops);
    }
  };

  const lineColor = getLineColor(selectedRoute?.id);

  return (
    <div className="app-container">
      <header><h1>Boston T Tracker</h1></header>

      <main>
        {/* --- SECTION: FAVORITES BAR --- */}
        {favorites.length > 0 && (
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

        <div className="selector-group">
          <label>Select Line</label>
          <select onChange={handleRouteSelect} value={selectedRoute?.id || ""}>
            <option value="" disabled>-- Choose a Line --</option>
            {routes.map(route => (
              <option key={route.id} value={route.id}>{route.attributes.long_name}</option>
            ))}
          </select>
        </div>

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
          <div 
            className="predictions-container slide-in"
            style={{ '--line-color': lineColor }} 
          >
            <div className="predictions-header">
              <h2>
                {selectedStop.attributes.name}
                {/* --- NEW: STAR BUTTON --- */}
                <button 
                  className="star-btn"
                  onClick={() => toggleFavorite(selectedStop, selectedRoute)}
                >
                  {isFavorite(selectedStop.id) ? "★" : "☆"}
                </button>
              </h2>
              <div style={{ fontSize: "0.8rem", color: "#888" }}>{loading ? "..." : "Live"}</div>
            </div>

            <div className="destinations-list">
              {predictionGroups.length === 0 ? (
                <p className="no-data">No trains predicted</p>
              ) : (
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
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
