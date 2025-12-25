import { useState, useEffect } from "react";
import MapView from "./MapView";
import FavoritesTab, { PredictionCard } from "./Favorite";
import "./App.css";

// --- CONFIGURATION ---
const SUBWAY_FILTERS = [
  "Red",
  "Orange",
  "Blue",
  "Green-B",
  "Green-C",
  "Green-D",
  "Green-E",
  "Mattapan",
  "741",
  "742",
  "743",
  "751",
  "749",
];

// --- HOOK: Manage Favorites ---
const useFavorites = () => {
  const [favorites, setFavorites] = useState([]);
  useEffect(() => {
    const saved = localStorage.getItem("mbta_favorites");
    if (saved) setFavorites(JSON.parse(saved));
  }, []);

  const toggleFavorite = (stop, route) => {
    let newFavorites;
    const exists = favorites.find((f) => f.stopId === stop.id);
    if (exists) {
      newFavorites = favorites.filter((f) => f.stopId !== stop.id);
    } else {
      newFavorites = [
        ...favorites,
        {
          stopId: stop.id,
          stopName: stop.attributes.name,
          routeId: route.id,
          routeName: route.attributes.long_name || route.id,
        },
      ];
    }
    setFavorites(newFavorites);
    localStorage.setItem("mbta_favorites", JSON.stringify(newFavorites));
  };

  const isFavorite = (stopId) => favorites.some((f) => f.stopId === stopId);
  return { favorites, toggleFavorite, isFavorite };
};

// --- HOOK: MBTA Data ---
const useMbtaData = () => {
  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState([]);
  const [predictionGroups, setPredictionGroups] = useState([]);
  const [favoritePredictions, setFavoritePredictions] = useState({});
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(false);

  const apiFetch = async (url) => {
    const apiKey = import.meta.env.VITE_MBTA_API_KEY;
    const headers = apiKey ? { "x-api-key": apiKey } : {};
    return fetch(url, { headers });
  };

  const normalizeName = (name) => {
    if (!name) return "";
    return name
      .toLowerCase()
      .replace("street", "st")
      .replace(/\s+/g, "")
      .trim();
  };

  const isNewTrain = (routeId, label) => {
    if (routeId !== "Red" || !label) return false;
    const carNumber = parseInt(label.split("-")[0], 10);
    return !isNaN(carNumber) && carNumber >= 1900;
  };

  const processPredictions = (json, stopName, routeId) => {
    const now = new Date();
    const tripMap = {};
    const vehicleMap = {};
    const vehicleDirMap = {};

    if (json.included) {
      json.included.forEach((item) => {
        if (item.type === "trip") tripMap[item.id] = item.attributes.headsign;
        if (item.type === "vehicle") {
          vehicleMap[item.id] = item.attributes.label;
          vehicleDirMap[item.id] = item.attributes.direction_id;
        }
      });
    }

    const stopNameNorm = normalizeName(stopName);
    const directionMap = {};

    const getDirectionName = (dirId) => {
      const route = routes.find((r) => r.id === routeId);
      const names = route?.attributes?.direction_names || [
        "Outbound",
        "Inbound",
      ];
      const name = names[dirId] || "Unknown";
      if (
        (name === "South" ||
          name === "North" ||
          name === "West" ||
          name === "East") &&
        !name.includes("bound")
      ) {
        return `${name}bound`;
      }
      return name;
    };

    json.data.forEach((pred) => {
      const arrivalTime = new Date(
        pred.attributes.arrival_time || pred.attributes.departure_time
      );
      if (arrivalTime > now) {
        const diffMs = arrivalTime - now;
        const minutes = Math.floor(diffMs / 60000);

        const tripId = pred.relationships?.trip?.data?.id;
        const vehicleId = pred.relationships?.vehicle?.data?.id;
        let headsign = tripMap[tripId] || pred.attributes.headsign || "Train";
        let carLabel = vehicleMap[vehicleId];
        let currentVehicleDir = vehicleDirMap[vehicleId];

        if (headsign === "Green Line D") headsign = "Riverside";
        if (headsign === "Green Line E") headsign = "Heath St";
        if (normalizeName(headsign) === stopNameNorm) return;

        const dirId = pred.attributes.direction_id;

        if (!directionMap[dirId]) {
          directionMap[dirId] = {
            id: dirId,
            title: getDirectionName(dirId),
            subgroups: {},
          };
        }
        if (!directionMap[dirId].subgroups[headsign]) {
          directionMap[dirId].subgroups[headsign] = {
            name: headsign,
            trains: [],
          };
        }

        directionMap[dirId].subgroups[headsign].trains.push({
          id: pred.id,
          routeId: routeId,
          directionId: dirId,
          vehicleId: vehicleId,
          vehicleDirectionId: currentVehicleDir,
          minutes: minutes < 1 ? "Now" : `${minutes} min`,
          status: pred.attributes.status,
          isNew: isNewTrain(routeId, carLabel),
        });
      }
    });

    return Object.values(directionMap)
      .map((dirGroup) => ({
        direction: dirGroup.title,
        directionId: dirGroup.id,
        groups: Object.values(dirGroup.subgroups)
          .map((sub) => ({
            ...sub,
            trains: sub.trains.sort((a, b) =>
              a.minutes === "Now"
                ? -1
                : parseInt(a.minutes) - parseInt(b.minutes)
            ),
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.directionId - b.directionId);
  };

  useEffect(() => {
    const fetchRoutes = async () => {
      try {
        const response = await apiFetch(
          "https://api-v3.mbta.com/routes?filter[type]=0,1,3"
        );
        const json = await response.json();
        const filteredRoutes = json.data.filter((r) =>
          SUBWAY_FILTERS.includes(r.id)
        );
        filteredRoutes.sort(
          (a, b) => a.attributes.sort_order - b.attributes.sort_order
        );
        setRoutes(filteredRoutes);
      } catch (err) {
        console.error("Failed routes", err);
      }
    };
    fetchRoutes();
  }, []);

  const fetchStops = async (routeId) => {
    setLoading(true);
    setStops([]);
    setPredictionGroups([]);
    try {
      const response = await apiFetch(
        `https://api-v3.mbta.com/stops?filter[route]=${routeId}`
      );
      const json = await response.json();
      return json.data;
    } catch (err) {
      console.error(err);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const TRUNK_STATIONS = {
    Copley: "Green-B,Green-C,Green-D,Green-E",
    Arlington: "Green-B,Green-C,Green-D,Green-E",
    Boylston: "Green-B,Green-C,Green-D,Green-E",
    "Park Street": "Green-B,Green-C,Green-D,Green-E",
    "Government Center": "Green-B,Green-C,Green-D,Green-E",
    Haymarket: "Green-D,Green-E",
    "North Station": "Green-D,Green-E",
    "Science Park/West End": "Green-D,Green-E",
    Lechmere: "Green-D,Green-E",
    Kenmore: "Green-B,Green-C,Green-D",
    "Hynes Convention Center": "Green-B,Green-C,Green-D",
  };

  const fetchPredictions = async (
    routeId,
    stopId,
    currentStopsList = stops
  ) => {
    try {
      const currentStop = currentStopsList.find((s) => s.id === stopId);
      const stopName = currentStop ? currentStop.attributes.name : "";
      let routeFilter = routeId;
      if (TRUNK_STATIONS[stopName]) {
        const trunkRoutes = TRUNK_STATIONS[stopName];
        if (trunkRoutes.includes(routeId)) routeFilter = trunkRoutes;
      }
      const response = await apiFetch(
        `https://api-v3.mbta.com/predictions?filter[stop]=${stopId}&filter[route]=${routeFilter}&sort=arrival_time&include=trip,vehicle`
      );
      const json = await response.json();
      const processed = processPredictions(json, stopName, routeId);
      setPredictionGroups(processed);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAllFavorites = async (favoritesList) => {
    if (!favoritesList || favoritesList.length === 0) return;
    const promises = favoritesList.map((fav) => {
      let routeFilter = fav.routeId;
      if (TRUNK_STATIONS[fav.stopName]) {
        const trunkRoutes = TRUNK_STATIONS[fav.stopName];
        if (trunkRoutes.includes(fav.routeId)) routeFilter = trunkRoutes;
      }
      return apiFetch(
        `https://api-v3.mbta.com/predictions?filter[stop]=${fav.stopId}&filter[route]=${routeFilter}&sort=arrival_time&include=trip,vehicle`
      )
        .then((res) => res.json())
        .then((json) => ({
          id: fav.stopId,
          data: processPredictions(json, fav.stopName, fav.routeId),
        }))
        .catch((err) => ({ id: fav.stopId, data: [] }));
    });
    const results = await Promise.all(promises);
    const newMap = {};
    results.forEach((res) => {
      newMap[res.id] = res.data;
    });
    setFavoritePredictions(newMap);
  };

  const fetchVehicles = async (routeId, directionId) => {
    try {
      const response = await apiFetch(
        `https://api-v3.mbta.com/vehicles?filter[route]=${routeId}&include=stop`
      );
      const json = await response.json();
      const stopParentMap = {};
      if (json.included) {
        json.included.forEach((item) => {
          if (item.type === "stop") {
            const parentId = item.relationships?.parent_station?.data?.id;
            stopParentMap[item.id] = parentId || item.id;
          }
        });
      }
      const activeTrains = json.data
        .filter((v) => v.attributes.direction_id === directionId)
        .map((v) => {
          const rawStopId = v.relationships?.stop?.data?.id;
          const parentStationId = stopParentMap[rawStopId] || rawStopId;
          return {
            id: v.id,
            status: v.attributes.current_status,
            stopId: parentStationId,
            label: v.attributes.label,
            isNew: isNewTrain(routeId, v.attributes.label),
          };
        });
      setVehicles(activeTrains);
    } catch (err) {
      console.error("Failed to fetch vehicles", err);
    }
  };

  return {
    routes,
    setStops,
    stops,
    predictionGroups,
    favoritePredictions,
    vehicles,
    fetchStops,
    fetchPredictions,
    fetchAllFavorites,
    fetchVehicles,
    loading,
    setStops,
  };
};

const getLineColor = (routeId) => {
  if (!routeId) return "#003da5";
  const id = routeId.toLowerCase();
  if (id.includes("red") || id === "mattapan") return "#da291c";
  if (id.includes("orange")) return "#ed8b00";
  if (id.includes("blue")) return "#003da5";
  if (id.includes("green")) return "#00843d";
  if (id.includes("74") || id.includes("75")) return "#7c878e";
  return "#003da5";
};

// --- MAIN APP ---
function App() {
  const {
    routes,
    stops,
    predictionGroups,
    favoritePredictions,
    vehicles,
    fetchStops,
    fetchPredictions,
    fetchAllFavorites,
    fetchVehicles,
    loading,
    setStops,
  } = useMbtaData();
  const { favorites, toggleFavorite, isFavorite } = useFavorites();

  const [currentTab, setCurrentTab] = useState("list");
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [selectedStop, setSelectedStop] = useState(null);
  const [mapDirection, setMapDirection] = useState(0);
  const [highlightedTrainId, setHighlightedTrainId] = useState(null);

  useEffect(() => {
    let intervalId;
    const poll = () => {
      if (currentTab === "list" && selectedRoute && selectedStop) {
        fetchPredictions(selectedRoute.id, selectedStop.id);
      }
      if (currentTab === "favorites" && favorites.length > 0) {
        fetchAllFavorites(favorites);
      }
      if (currentTab === "map" && selectedRoute) {
        fetchVehicles(selectedRoute.id, mapDirection);
      }
    };
    poll();
    intervalId = setInterval(poll, 4000);
    return () => clearInterval(intervalId);
  }, [currentTab, selectedRoute, selectedStop, mapDirection, favorites]);

  // --- NEW: AUTO-CLEAR HIGHLIGHT ON TAB CHANGE ---
  useEffect(() => {
    if (currentTab !== "map") {
      setHighlightedTrainId(null);
    }
  }, [currentTab]);

  // ... (Handlers unchanged) ...
  const handleRouteSelect = async (e) => {
    const routeId = e.target.value;
    const routeObj = routes.find((r) => r.id === routeId);
    setSelectedRoute(routeObj);
    setSelectedStop(null);
    if (routeId) {
      const newStops = await fetchStops(routeId);
      setStops(newStops);
    }
  };

  const handleStopSelect = (e) => {
    const stopId = e.target.value;
    const stopObj = stops.find((s) => s.id === stopId);
    setSelectedStop(stopObj);
  };

  const handleMapStationClick = (stop) => {
    setSelectedStop(stop);
    setCurrentTab("list");
  };

  // --- TRAIN CLICK HANDLER ---
  const handleTrainClick = async (train) => {
    if (!train.vehicleId) {
      console.log("No vehicle ID available for this train");
      return;
    }

    const routeObj = routes.find((r) => r.id === train.routeId);
    if (routeObj) {
      setSelectedRoute(routeObj);
      if (!selectedRoute || selectedRoute.id !== train.routeId) {
        const newStops = await fetchStops(train.routeId);
        setStops(newStops);
      }
    }

    const dirToSet =
      train.vehicleDirectionId !== undefined &&
      train.vehicleDirectionId !== null
        ? train.vehicleDirectionId
        : train.directionId;

    setMapDirection(dirToSet);
    setHighlightedTrainId(train.vehicleId);
    setCurrentTab("map");
  };

  const lineColor = getLineColor(selectedRoute?.id);

  return (
    <div className="app-container" style={{ "--line-color": lineColor }}>
      <header>
        <h1>Boston T Tracker</h1>
      </header>

      <main className="main-content">
        {/* --- TAB 1: SEARCH --- */}
        {currentTab === "list" && (
          <>
            <div className="selector-group">
              <label>Select Line</label>
              <select
                onChange={handleRouteSelect}
                value={selectedRoute?.id || ""}
              >
                <option value="" disabled>
                  -- Choose a Line --
                </option>
                {routes.map((route) => (
                  <option key={route.id} value={route.id}>
                    {route.attributes.long_name}
                  </option>
                ))}
              </select>
            </div>

            {selectedRoute && (
              <div className="selector-group slide-in">
                <label>Select Station</label>
                <select
                  onChange={handleStopSelect}
                  value={selectedStop?.id || ""}
                >
                  <option value="" disabled>
                    -- Choose a Station --
                  </option>
                  {stops.map((stop) => (
                    <option key={stop.id} value={stop.id}>
                      {stop.attributes.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedStop && (
              <div className="predictions-container slide-in">
                <PredictionCard
                  title={selectedStop.attributes.name}
                  groups={predictionGroups}
                  isFav={isFavorite(selectedStop.id)}
                  onStarClick={() =>
                    toggleFavorite(selectedStop, selectedRoute)
                  }
                  onTrainClick={handleTrainClick}
                  lineColor={lineColor}
                />
              </div>
            )}
          </>
        )}

        {/* --- TAB 2: FAVORITES --- */}
        {currentTab === "favorites" && (
          <FavoritesTab
            favorites={favorites}
            favoritePredictions={favoritePredictions}
            toggleFavorite={toggleFavorite}
            getLineColor={getLineColor}
            onTrainClick={handleTrainClick}
          />
        )}

        {/* --- TAB 3: MAP --- */}
        {currentTab === "map" && (
          <>
            <div className="selector-group">
              <label>Select Line</label>
              <select
                onChange={handleRouteSelect}
                value={selectedRoute?.id || ""}
              >
                <option value="" disabled>
                  -- Choose a Line --
                </option>
                {routes.map((route) => (
                  <option key={route.id} value={route.id}>
                    {route.attributes.long_name}
                  </option>
                ))}
              </select>
            </div>
            <MapView
              route={selectedRoute}
              stops={stops}
              vehicles={vehicles}
              directionId={mapDirection}
              onDirectionChange={setMapDirection}
              onStationSelect={handleMapStationClick}
              highlightedTrainId={highlightedTrainId}
            />
          </>
        )}
      </main>

      <nav className="bottom-nav">
        <button
          className={`nav-item ${currentTab === "list" ? "active" : ""}`}
          onClick={() => setCurrentTab("list")}
        >
          <span className="nav-icon">🔍</span>
          <span className="nav-label">Search</span>
        </button>
        <button
          className={`nav-item ${currentTab === "favorites" ? "active" : ""}`}
          onClick={() => setCurrentTab("favorites")}
        >
          <span className="nav-icon">★</span>
          <span className="nav-label">Favorites</span>
        </button>
        <button
          className={`nav-item ${currentTab === "map" ? "active" : ""}`}
          onClick={() => setCurrentTab("map")}
        >
          <span className="nav-icon">🗺️</span>
          <span className="nav-label">Map</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
