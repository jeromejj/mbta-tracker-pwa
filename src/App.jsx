import { useState, useEffect } from 'react';
import './App.css';

// --- CONFIGURATION ---
const SUBWAY_FILTERS = [
  'Red', 'Orange', 'Blue',
  'Green-B', 'Green-C', 'Green-D', 'Green-E',
  'Mattapan',
  '741', '742', '743', '751', '749' // Silver Line
];

// --- CUSTOM HOOK ---
const useMbtaData = () => {
  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState([]);
  const [predictionGroups, setPredictionGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Helper: Normalize names to ensure "Heath Street" matches "Heath St"
  const normalizeName = (name) => {
    if (!name) return "";
    return name.toLowerCase().replace("street", "st").replace(/\s+/g, '').trim();
  };

  // Helper: Check if train is "New" (Red Line 1900 series)
  const isNewTrain = (routeId, label) => {
    if (routeId !== 'Red' || !label) return false;
    // Label can be "1900" or "1900-1901"
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
    } catch (err) {
      setError("Could not load stops.");
    } finally {
      setLoading(false);
    }
  };

  // 3. Fetch Predictions (UPDATED)
  const fetchPredictions = async (routeId, stopId) => {
    try {
      const currentStop = stops.find(s => s.id === stopId);
      const currentStopNameNorm = currentStop ? normalizeName(currentStop.attributes.name) : "";

      // UPDATE: Added "vehicle" to include
      const response = await fetch(
        `https://api-v3.mbta.com/predictions?filter[stop]=${stopId}&filter[route]=${routeId}&sort=arrival_time&include=trip,vehicle`
      );
      const json = await response.json();
      const now = new Date();
      
      // 3a. Build Maps for Trip (Headsign) and Vehicle (Label/Number)
      const tripMap = {};
      const vehicleMap = {};
      
      if (json.included) {
        json.included.forEach(item => {
          if (item.type === 'trip') {
            tripMap[item.id] = item.attributes.headsign;
          }
          if (item.type === 'vehicle') {
            vehicleMap[item.id] = item.attributes.label; // e.g., "1900"
          }
        });
      }

      // 3b. Group predictions
      const groups = {};

      json.data.forEach((pred) => {
        const arrivalTime = new Date(pred.attributes.arrival_time || pred.attributes.departure_time);
        
        if (arrivalTime > now) {
          const diffMs = arrivalTime - now;
          const minutes = Math.floor(diffMs / 60000);
          
          const tripId = pred.relationships?.trip?.data?.id;
          const vehicleId = pred.relationships?.vehicle?.data?.id;
          
          let headsign = tripMap[tripId] || pred.attributes.headsign || "Train";
          let carLabel = vehicleMap[vehicleId]; // The car number (e.g. 1905)

          // Fix Green Line names
          if (headsign === "Green Line D") headsign = "Riverside"; 
          if (headsign === "Green Line E") headsign = "Heath St";

          // Terminal Filter
          if (normalizeName(headsign) === currentStopNameNorm) {
            return; 
          }

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
            isNew: isNewTrain(routeId, carLabel) // Check if new train
          });
        }
      });

      // 3c. Format and Sort
      const finalGroups = Object.values(groups)
        .map(group => ({
          ...group,
          trains: group.trains
            .sort((a, b) => (a.minutes === "Now" ? -1 : parseInt(a.minutes) - parseInt(b.minutes)))
        }))
        .sort((a, b) => a.directionId - b.directionId || a.name.localeCompare(b.name));

      setPredictionGroups(finalGroups);

    } catch (err) {
      console.error(err);
    }
  };

  return { routes, stops, predictionGroups, fetchStops, fetchPredictions, loading };
};

// --- HELPER: Get Official MBTA Colors ---
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

  const lineColor = getLineColor(selectedRoute?.id);

  return (
    <div className="app-container">
      <header><h1>Boston T Tracker</h1></header>

      <main>
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
              <h2>{selectedStop.attributes.name}</h2>
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
                            {/* NEW TRAIN INDICATOR */}
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
