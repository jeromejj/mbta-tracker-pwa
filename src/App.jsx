import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import FavoritesTab, { PredictionCard } from "./Favorite";
import { SearchIcon, StarIcon, MapIcon, AlertIcon } from "./Icons";
import InstallPrompt from "./InstallPrompt";
import MapView from "./MapView";

import "./App.css";

const getFavoriteKey = (routeId, stopId) => `${routeId}:${stopId}`;

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
  "746",
  "751",
  "749",
];

const GREEN_BRANCH_IDS = ["Green-B", "Green-C", "Green-D", "Green-E"];

const GREEN_CENTRAL_ROUTE = {
  id: "Green",
  attributes: {
    long_name: "Green Line (Central Subway)",
    direction_names: ["West", "East"],
    sort_order: 10031,
  },
};

const GREEN_BRANCH_OPTIONS = [
  { id: "Green", label: "Central" },
  { id: "Green-B", label: "B" },
  { id: "Green-C", label: "C" },
  { id: "Green-D", label: "D" },
  { id: "Green-E", label: "E" },
];

const isGreenRoute = (routeId) =>
  routeId === "Green" || GREEN_BRANCH_IDS.includes(routeId);

const getGreenBranchLetter = (routeId) =>
  routeId && routeId.startsWith("Green-") ? routeId.split("-")[1] : null;

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

const POLL_INTERVAL_MS = 10000;
const ALERT_POLL_INTERVAL_MS = 60000;

const getTrunkRouteFilter = (stopName, routeId) => {
  if (stopName && TRUNK_STATIONS[stopName]) {
    const trunkRoutes = TRUNK_STATIONS[stopName];
    if (routeId === "Green" || trunkRoutes.split(",").includes(routeId)) {
      return trunkRoutes;
    }
  }
  return routeId === "Green" ? GREEN_BRANCH_IDS.join(",") : routeId;
};

const normalizeName = (name) => {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/\bstreet\b/g, "st")
    .replace(/\s+/g, "")
    .trim();
};

const isNewTrain = (routeId, label) => {
  if (routeId !== "Red" || !label) return false;
  const carNumber = parseInt(label.split("-")[0], 10);
  return !isNaN(carNumber) && carNumber >= 1900;
};

const filterActiveServiceAlerts = (data) => {
  if (!Array.isArray(data)) return [];
  const nonServiceEffects = [
    "NOTICE",
    "SUMMARY",
    "OTHER_EFFECT",
    "UNKNOWN_EFFECT",
    "AMBER_ALERT",
    "ACCESS_ISSUE",
    "FACILITY_ISSUE",
    "BIKE_ISSUE",
    "PARKING_ISSUE",
    "PARKING_CLOSURE",
    "STATION_ISSUE",
    "ELEVATOR_CLOSURE",
    "ESCALATOR_CLOSURE",
    "POLICY_CHANGE",
  ];
  return data.filter((a) => {
    const isLifecycleActive = [
      "NEW",
      "ONGOING",
      "ONGOING_UPCOMING",
    ].includes(a.attributes?.lifecycle);
    return (
      isLifecycleActive && !nonServiceEffects.includes(a.attributes?.effect)
    );
  });
};

// --- HOOK: Manage Favorites ---
const useFavorites = () => {
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem("mbta_favorites");
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error("Failed to parse saved favorites", err);
      return [];
    }
  });

  const toggleFavorite = useCallback((stop, route) => {
    if (!stop || !route) return;
    setFavorites((prev) => {
      const exists = prev.some(
        (f) => f.stopId === stop.id && f.routeId === route.id
      );
      const next = exists
        ? prev.filter(
            (f) => !(f.stopId === stop.id && f.routeId === route.id)
          )
        : [
            ...prev,
            {
              stopId: stop.id,
              stopName: stop.attributes?.name || stop.stopName || stop.id,
              routeId: route.id,
              routeName:
                route.attributes?.long_name || route.routeName || route.id,
            },
          ];
      try {
        localStorage.setItem("mbta_favorites", JSON.stringify(next));
      } catch (err) {
        console.error("Failed to save favorites", err);
      }
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (stopId, routeId) =>
      favorites.some(
        (f) => f.stopId === stopId && (!routeId || f.routeId === routeId)
      ),
    [favorites]
  );

  return { favorites, toggleFavorite, isFavorite };
};

// --- HOOK: MBTA Data ---
const useMbtaData = () => {
  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState([]);
  const [predictionGroups, setPredictionGroups] = useState([]);
  const [favoritePredictions, setFavoritePredictions] = useState({});
  const [vehicles, setVehicles] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [favoriteAlerts, setFavoriteAlerts] = useState({});
  const [loading, setLoading] = useState(false);

  const stopsRequestIdRef = useRef(0);
  const stopsCacheRef = useRef({});
  const greenAlertsCacheRef = useRef(null);

  const apiFetchJson = useCallback(async (url, signal) => {
    const apiKey = import.meta.env.VITE_MBTA_API_KEY;
    const headers = apiKey ? { "x-api-key": apiKey } : {};
    const response = await fetch(url, { headers, signal });
    if (!response.ok) {
      throw new Error(`MBTA API error: ${response.status}`);
    }
    return response.json();
  }, []);

  const processPredictions = useCallback(
    (json, stopName, routeId) => {
      if (!json || !Array.isArray(json.data)) return [];
      const nowMs = Date.now();
      const tripMap = {};
      const vehicleMap = {};
      const vehicleDirMap = {};

      if (Array.isArray(json.included)) {
        json.included.forEach((item) => {
          if (item.type === "trip") {
            tripMap[item.id] = item.attributes?.headsign;
          }
          if (item.type === "vehicle") {
            vehicleMap[item.id] = item.attributes?.label;
            vehicleDirMap[item.id] = item.attributes?.direction_id;
          }
        });
      }

      const stopNameNorm = normalizeName(stopName);
      const directionMap = {};

      const getDirectionName = (dirId) => {
        const route =
          routes.find((r) => r.id === routeId) ||
          (routeId === "Green" ? GREEN_CENTRAL_ROUTE : null);
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
        const rawArrival = pred.attributes?.arrival_time;
        const rawDeparture = pred.attributes?.departure_time;
        const rawStatus = pred.attributes?.status;

        const arrivalMs = rawArrival ? new Date(rawArrival).getTime() : null;
        const departureMs = rawDeparture
          ? new Date(rawDeparture).getTime()
          : null;

        let displayMinutes = null;
        let sortTime = null;

        if (arrivalMs !== null || departureMs !== null) {
          if (departureMs !== null && departureMs < nowMs) return;
          if (
            departureMs === null &&
            arrivalMs !== null &&
            arrivalMs < nowMs - 30000
          ) {
            return;
          }

          const targetMs =
            arrivalMs !== null && arrivalMs > nowMs
              ? arrivalMs
              : departureMs ?? arrivalMs;
          const diffMs = Math.max(0, targetMs - nowMs);
          const minutes = Math.floor(diffMs / 60000);
          displayMinutes = minutes < 1 ? "Now" : `${minutes} min`;
          sortTime = arrivalMs ?? departureMs;
        } else if (rawStatus) {
          displayMinutes = rawStatus;
          sortTime = Number.MAX_SAFE_INTEGER;
        } else {
          return;
        }

        const tripId = pred.relationships?.trip?.data?.id;
        const vehicleId = pred.relationships?.vehicle?.data?.id;
        const actualRouteId =
          pred.relationships?.route?.data?.id || routeId;
        const branchLetter = getGreenBranchLetter(actualRouteId);

        let headsign =
          tripMap[tripId] || pred.attributes?.headsign || "Train";
        const carLabel = vehicleMap[vehicleId];
        const currentVehicleDir = vehicleDirMap[vehicleId];

        if (headsign === "Green Line D") headsign = "Riverside";
        if (headsign === "Green Line E" || headsign === "Heath St") {
          headsign = "Heath Street";
        }
        if (stopNameNorm && normalizeName(headsign) === stopNameNorm) return;

        const dirId = pred.attributes?.direction_id;

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
            branches: new Set(),
            trains: [],
          };
        }

        if (branchLetter) {
          directionMap[dirId].subgroups[headsign].branches.add(branchLetter);
        }

        directionMap[dirId].subgroups[headsign].trains.push({
          id: pred.id,
          routeId: actualRouteId,
          branch: branchLetter,
          directionId: dirId,
          vehicleId: vehicleId,
          vehicleDirectionId: currentVehicleDir,
          minutes: displayMinutes,
          sortTime: sortTime,
          status: rawStatus,
          isNew: isNewTrain(actualRouteId, carLabel),
        });
      });

      return Object.values(directionMap)
        .map((dirGroup) => ({
          direction: dirGroup.title,
          directionId: dirGroup.id,
          groups: Object.values(dirGroup.subgroups)
            .map((sub) => ({
              name: sub.name,
              branches: [...sub.branches].sort(),
              trains: sub.trains.sort((a, b) => a.sortTime - b.sortTime),
            }))
            .sort((a, b) => {
              const branchA = a.branches[0] || "";
              const branchB = b.branches[0] || "";
              if (branchA !== branchB) return branchA.localeCompare(branchB);
              return a.name.localeCompare(b.name);
            }),
        }))
        .sort((a, b) => a.directionId - b.directionId);
    },
    [routes]
  );

  useEffect(() => {
    const controller = new AbortController();
    const fetchRoutes = async () => {
      try {
        const json = await apiFetchJson(
          "https://api-v3.mbta.com/routes?filter[type]=0,1,3",
          controller.signal
        );
        const filteredRoutes = (json.data || []).filter((r) =>
          SUBWAY_FILTERS.includes(r.id)
        );
        filteredRoutes.sort(
          (a, b) => a.attributes.sort_order - b.attributes.sort_order
        );
        setRoutes(filteredRoutes);
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Failed routes", err);
        }
      }
    };
    fetchRoutes();
    return () => controller.abort();
  }, [apiFetchJson]);

  const fetchStops = useCallback(
    async (routeId) => {
      const requestId = ++stopsRequestIdRef.current;

      // Return immediately from in-memory cache if available
      if (stopsCacheRef.current[routeId]) {
        const cached = stopsCacheRef.current[routeId];
        setStops(cached);
        setLoading(false);
        return cached;
      }

      setLoading(true);
      setStops([]);
      try {
        const apiRoute = routeId === "Green" ? "Green-D" : routeId;
        const json = await apiFetchJson(
          `https://api-v3.mbta.com/stops?filter[route]=${apiRoute}`
        );
        const rawStops = json.data || [];
        if (rawStops.length > 0) {
          stopsCacheRef.current[apiRoute] = rawStops;
          if (apiRoute === "Green-D") {
            stopsCacheRef.current["Green"] = rawStops.filter((s) =>
              Boolean(TRUNK_STATIONS[s.attributes?.name])
            );
          }
        }
        const newStops =
          stopsCacheRef.current[routeId] ||
          (routeId === "Green"
            ? rawStops.filter((s) => Boolean(TRUNK_STATIONS[s.attributes?.name]))
            : rawStops);
        if (requestId === stopsRequestIdRef.current) {
          setStops(newStops);
        }
        return newStops;
      } catch (err) {
        console.error("Failed to fetch stops", err);
        return [];
      } finally {
        if (requestId === stopsRequestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [apiFetchJson]
  );

  const fetchPredictions = useCallback(
    async (routeId, stopId, stopName = "", signal) => {
      try {
        const routeFilter = getTrunkRouteFilter(stopName, routeId);
        const json = await apiFetchJson(
          `https://api-v3.mbta.com/predictions?filter[stop]=${stopId}&filter[route]=${routeFilter}&sort=arrival_time&include=trip,vehicle`,
          signal
        );
        const processed = processPredictions(json, stopName, routeId);
        setPredictionGroups(processed);
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Failed to fetch predictions", err);
        }
      }
    },
    [apiFetchJson, processPredictions]
  );

  const fetchAllFavorites = useCallback(
    async (favoritesList, signal) => {
      if (!favoritesList || favoritesList.length === 0) return;
      const promises = favoritesList.map((fav) => {
        const favKey = getFavoriteKey(fav.routeId, fav.stopId);
        const routeFilter = getTrunkRouteFilter(fav.stopName, fav.routeId);
        return apiFetchJson(
          `https://api-v3.mbta.com/predictions?filter[stop]=${fav.stopId}&filter[route]=${routeFilter}&sort=arrival_time&include=trip,vehicle`,
          signal
        )
          .then((json) => ({
            key: favKey,
            ok: true,
            data: processPredictions(json, fav.stopName, fav.routeId),
          }))
          .catch((err) => {
            if (err.name !== "AbortError") {
              console.error(`Failed predictions for ${favKey}`, err);
            }
            return { key: favKey, ok: false, data: null };
          });
      });
      const results = await Promise.all(promises);
      setFavoritePredictions((prev) => {
        const next = { ...prev };
        results.forEach((res) => {
          if (res.ok) {
            next[res.key] = res.data;
          }
        });
        return next;
      });
    },
    [apiFetchJson, processPredictions]
  );

  const fetchVehicles = useCallback(
    async (routeId, directionId, signal) => {
      try {
        const routeFilter = isGreenRoute(routeId)
          ? GREEN_BRANCH_IDS.join(",")
          : routeId;
        const json = await apiFetchJson(
          `https://api-v3.mbta.com/vehicles?filter[route]=${routeFilter}&include=stop`,
          signal
        );
        const stopParentMap = {};
        if (Array.isArray(json.included)) {
          json.included.forEach((item) => {
            if (item.type === "stop") {
              const parentId = item.relationships?.parent_station?.data?.id;
              stopParentMap[item.id] = parentId || item.id;
            }
          });
        }
        const activeTrains = (json.data || [])
          .filter((v) => v.attributes?.direction_id === directionId)
          .map((v) => {
            const rawStopId = v.relationships?.stop?.data?.id;
            const parentStationId = stopParentMap[rawStopId] || rawStopId;
            const vehicleRouteId =
              v.relationships?.route?.data?.id || routeId;
            return {
              id: v.id,
              routeId: vehicleRouteId,
              branch: getGreenBranchLetter(vehicleRouteId),
              status: v.attributes?.current_status,
              stopId: parentStationId,
              label: v.attributes?.label,
              isNew: isNewTrain(vehicleRouteId, v.attributes?.label),
            };
          });
        setVehicles(activeTrains);
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Failed to fetch vehicles", err);
        }
      }
    },
    [apiFetchJson]
  );

  const fetchAlerts = useCallback(
    async (routeId, signal) => {
      try {
        if (isGreenRoute(routeId)) {
          let allGreenAlerts = greenAlertsCacheRef.current;
          if (!allGreenAlerts) {
            const json = await apiFetchJson(
              `https://api-v3.mbta.com/alerts?filter[route]=${GREEN_BRANCH_IDS.join(",")}`,
              signal
            );
            allGreenAlerts = filterActiveServiceAlerts(json.data);
            greenAlertsCacheRef.current = allGreenAlerts;
          }
          if (routeId === "Green") {
            setAlerts(allGreenAlerts);
          } else {
            setAlerts(
              allGreenAlerts.filter((a) =>
                (a.attributes?.informed_entity || []).some(
                  (e) => e.route === routeId
                )
              )
            );
          }
          return;
        }

        const json = await apiFetchJson(
          `https://api-v3.mbta.com/alerts?filter[route]=${routeId}`,
          signal
        );
        setAlerts(filterActiveServiceAlerts(json.data));
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Failed to fetch alerts", err);
        }
      }
    },
    [apiFetchJson]
  );

  const fetchFavoriteAlerts = useCallback(
    async (favoritesList, signal) => {
      if (!favoritesList || favoritesList.length === 0) return;

      const routeSet = new Set();
      favoritesList.forEach((fav) => {
        const routeFilter = getTrunkRouteFilter(fav.stopName, fav.routeId);
        routeFilter.split(",").forEach((r) => routeSet.add(r));
      });

      const allRoutes = [...routeSet];
      if (allRoutes.length === 0) return;

      try {
        const json = await apiFetchJson(
          `https://api-v3.mbta.com/alerts?filter[route]=${allRoutes.join(",")}`,
          signal
        );
        const activeAlerts = filterActiveServiceAlerts(json.data);
        const nextAlertsMap = {};

        favoritesList.forEach((fav) => {
          const favKey = getFavoriteKey(fav.routeId, fav.stopId);
          const relevantRoutes = getTrunkRouteFilter(
            fav.stopName,
            fav.routeId
          ).split(",");
          const matchingAlerts = activeAlerts.filter((alert) => {
            const entities = alert.attributes?.informed_entity || [];
            return entities.some((e) => relevantRoutes.includes(e.route));
          });
          nextAlertsMap[favKey] = matchingAlerts;
        });

        setFavoriteAlerts(nextAlertsMap);
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Failed to fetch favorite alerts", err);
        }
      }
    },
    [apiFetchJson]
  );

  return {
    routes,
    stops,
    predictionGroups,
    favoritePredictions,
    vehicles,
    alerts,
    favoriteAlerts,
    fetchStops,
    fetchPredictions,
    fetchAllFavorites,
    fetchVehicles,
    fetchAlerts,
    fetchFavoriteAlerts,
    setPredictionGroups,
    setVehicles,
    setAlerts,
    loading,
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

const GreenBranchSelector = ({ selectedRouteId, onSelectBranch }) => (
  <div className="green-branch-selector">
    <span className="green-branch-label">Branch</span>
    <div className="green-branch-pills">
      {GREEN_BRANCH_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={`green-branch-pill ${
            selectedRouteId === opt.id ? "active" : ""
          }`}
          onClick={() => onSelectBranch(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);

// --- MAIN APP ---
function App() {
  const {
    routes,
    stops,
    predictionGroups,
    favoritePredictions,
    vehicles,
    alerts,
    favoriteAlerts,
    fetchStops,
    fetchPredictions,
    fetchAllFavorites,
    fetchVehicles,
    fetchAlerts,
    fetchFavoriteAlerts,
    setPredictionGroups,
    setVehicles,
    setAlerts,
    loading,
  } = useMbtaData();
  const { favorites, toggleFavorite, isFavorite } = useFavorites();

  const [currentTab, setCurrentTab] = useState("list");
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [selectedStop, setSelectedStop] = useState(null);
  const [mapDirection, setMapDirection] = useState(0);
  const [highlightedTrainId, setHighlightedTrainId] = useState(null);

  // Collapse Green-B/C/D/E into a single "Green Line" option in the top dropdown
  const selectorRoutes = useMemo(() => {
    const result = [];
    let greenInserted = false;
    routes.forEach((route) => {
      if (GREEN_BRANCH_IDS.includes(route.id)) {
        if (!greenInserted) {
          result.push({
            id: "Green",
            attributes: {
              ...GREEN_CENTRAL_ROUTE.attributes,
              long_name: "Green Line",
            },
          });
          greenInserted = true;
        }
      } else {
        result.push(route);
      }
    });
    return result;
  }, [routes]);

  const dropdownRouteValue = isGreenRoute(selectedRoute?.id)
    ? "Green"
    : selectedRoute?.id || "";

  // On the Map tab, all Green Line branches share the same vehicle feed ("Green")
  const mapVehicleFamily = selectedRoute
    ? isGreenRoute(selectedRoute.id)
      ? "Green"
      : selectedRoute.id
    : null;

  const handleTabChange = (tab) => {
    setCurrentTab(tab);
    if (tab !== "map") {
      setHighlightedTrainId(null);
    }
  };

  // Poll predictions (Search & Favorites tabs)
  useEffect(() => {
    if (currentTab === "map") return;
    const controller = new AbortController();

    const pollPredictions = () => {
      if (document.visibilityState === "hidden") return;
      if (currentTab === "list" && selectedRoute && selectedStop) {
        fetchPredictions(
          selectedRoute.id,
          selectedStop.id,
          selectedStop.attributes?.name || "",
          controller.signal
        );
      } else if (currentTab === "favorites" && favorites.length > 0) {
        fetchAllFavorites(favorites, controller.signal);
      }
    };

    pollPredictions();
    const intervalId = setInterval(pollPredictions, POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        pollPredictions();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      controller.abort();
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    currentTab,
    selectedRoute,
    selectedStop,
    favorites,
    fetchPredictions,
    fetchAllFavorites,
  ]);

  // Poll vehicles (Map tab only; switching Green Line branches reuses the shared Green vehicle feed)
  useEffect(() => {
    if (currentTab !== "map" || !mapVehicleFamily) return;
    const controller = new AbortController();

    const pollVehicles = () => {
      if (document.visibilityState === "hidden") return;
      fetchVehicles(mapVehicleFamily, mapDirection, controller.signal);
    };

    pollVehicles();
    const intervalId = setInterval(pollVehicles, POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        pollVehicles();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      controller.abort();
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [currentTab, mapVehicleFamily, mapDirection, fetchVehicles]);

  // Poll favorite alerts at a slower 60s cadence in a single batched request
  useEffect(() => {
    if (currentTab !== "favorites" || favorites.length === 0) return;
    const controller = new AbortController();

    const pollAlerts = () => {
      if (document.visibilityState === "hidden") return;
      fetchFavoriteAlerts(favorites, controller.signal);
    };

    pollAlerts();
    const intervalId = setInterval(pollAlerts, ALERT_POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      clearInterval(intervalId);
    };
  }, [currentTab, favorites, fetchFavoriteAlerts]);

  // Fetch route service alerts when selectedRoute changes
  useEffect(() => {
    if (!selectedRoute) return;
    const controller = new AbortController();
    fetchAlerts(selectedRoute.id, controller.signal);
    return () => controller.abort();
  }, [selectedRoute, fetchAlerts]);

  const selectRouteById = async (routeId, preserveStop = false) => {
    const routeObj =
      routeId === "Green"
        ? GREEN_CENTRAL_ROUTE
        : routes.find((r) => r.id === routeId) || null;
    const prevRouteId = selectedRoute?.id;
    const prevStop = selectedStop;
    const stayingOnGreen =
      isGreenRoute(prevRouteId) && isGreenRoute(routeId);

    setSelectedRoute(routeObj);
    if (!preserveStop) {
      setSelectedStop(null);
      setPredictionGroups([]);
    }
    if (!stayingOnGreen) {
      setVehicles([]);
      setAlerts([]);
    }

    if (routeId) {
      const newStops = await fetchStops(routeId);
      if (preserveStop && prevStop) {
        const stillExists = newStops.some((s) => s.id === prevStop.id);
        if (!stillExists) {
          setSelectedStop(null);
          setPredictionGroups([]);
        }
      }
    }
  };

  const handleRouteSelect = async (e) => {
    const routeId = e.target.value;
    await selectRouteById(routeId, false);
  };

  const handleGreenBranchSelect = async (branchRouteId) => {
    if (selectedRoute?.id === branchRouteId) return;
    await selectRouteById(branchRouteId, true);
  };

  const handleStopSelect = (e) => {
    const stopId = e.target.value;
    const stopObj = stops.find((s) => s.id === stopId) || null;
    setSelectedStop(stopObj);
    setPredictionGroups([]);
  };

  const handleMapStationClick = (stop) => {
    setSelectedStop(stop);
    handleTabChange("list");
  };

  // --- TRAIN CLICK HANDLER ---
  const handleTrainClick = async (train) => {
    if (!train.vehicleId) return;

    if (
      train.routeId &&
      (!selectedRoute || selectedRoute.id !== train.routeId)
    ) {
      await selectRouteById(train.routeId, true);
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
              <label htmlFor="search-route-select">Select Line</label>
              <select
                id="search-route-select"
                onChange={handleRouteSelect}
                value={dropdownRouteValue}
              >
                <option value="" disabled>
                  -- Choose a Line --
                </option>
                {selectorRoutes.map((route) => (
                  <option key={route.id} value={route.id}>
                    {route.attributes.long_name}
                  </option>
                ))}
              </select>

              {isGreenRoute(selectedRoute?.id) && (
                <GreenBranchSelector
                  selectedRouteId={selectedRoute.id}
                  onSelectBranch={handleGreenBranchSelect}
                />
              )}
            </div>

            {alerts.length > 0 && (
              <div className="alert-container fade-in">
                {alerts.map((alert) => (
                  <div key={alert.id} className="alert-box">
                    <span className="alert-icon">
                      <AlertIcon size={18} />
                    </span>
                    <div className="alert-content">
                      <strong>
                        {alert.attributes.service_effect || "Service Alert"}
                      </strong>
                      <p>{alert.attributes.header}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selectedRoute && (
              <div className="selector-group fade-in">
                <label htmlFor="search-stop-select">
                  {selectedRoute.id === "Green"
                    ? "Select Central Subway Station"
                    : "Select Station"}
                </label>
                <select
                  id="search-stop-select"
                  onChange={handleStopSelect}
                  value={selectedStop?.id || ""}
                  disabled={loading && stops.length === 0}
                >
                  <option value="" disabled>
                    {loading && stops.length === 0
                      ? "Loading stations..."
                      : "-- Choose a Station --"}
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
              <div className="predictions-container fade-in">
                <PredictionCard
                  title={selectedStop.attributes.name}
                  subtitle={
                    TRUNK_STATIONS[selectedStop.attributes.name] &&
                    isGreenRoute(selectedRoute?.id)
                      ? `Green Line (${TRUNK_STATIONS[
                          selectedStop.attributes.name
                        ]
                          .replace(/Green-/g, "")
                          .replace(/,/g, " · ")})`
                      : undefined
                  }
                  groups={predictionGroups}
                  isFav={isFavorite(selectedStop.id, selectedRoute?.id)}
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
            favoriteAlerts={favoriteAlerts}
            toggleFavorite={toggleFavorite}
            getLineColor={getLineColor}
            onTrainClick={handleTrainClick}
          />
        )}

        {/* --- TAB 3: MAP --- */}
        {currentTab === "map" && (
          <>
            <div className="selector-group">
              <label htmlFor="map-route-select">Select Line</label>
              <select
                id="map-route-select"
                onChange={handleRouteSelect}
                value={dropdownRouteValue}
              >
                <option value="" disabled>
                  -- Choose a Line --
                </option>
                {selectorRoutes.map((route) => (
                  <option key={route.id} value={route.id}>
                    {route.attributes.long_name}
                  </option>
                ))}
              </select>

              {isGreenRoute(selectedRoute?.id) && (
                <GreenBranchSelector
                  selectedRouteId={selectedRoute.id}
                  onSelectBranch={handleGreenBranchSelect}
                />
              )}
            </div>

            {alerts.length > 0 && (
              <div className="alert-container fade-in">
                {alerts.map((alert) => (
                  <div key={alert.id} className="alert-box">
                    <span className="alert-icon">
                      <AlertIcon size={18} />
                    </span>
                    <div className="alert-content">
                      <strong>
                        {alert.attributes.service_effect || "Service Alert"}
                      </strong>
                      <p>{alert.attributes.header}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

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

      <InstallPrompt />

      <nav className="bottom-nav">
        <button
          type="button"
          className={`nav-item ${currentTab === "list" ? "active" : ""}`}
          onClick={() => handleTabChange("list")}
        >
          <span className="nav-icon">
            <SearchIcon size={20} />
          </span>
          <span className="nav-label">Search</span>
        </button>
        <button
          type="button"
          className={`nav-item ${currentTab === "favorites" ? "active" : ""}`}
          onClick={() => handleTabChange("favorites")}
        >
          <span className="nav-icon">
            <StarIcon size={20} filled={currentTab === "favorites"} />
          </span>
          <span className="nav-label">Favorites</span>
        </button>
        <button
          type="button"
          className={`nav-item ${currentTab === "map" ? "active" : ""}`}
          onClick={() => handleTabChange("map")}
        >
          <span className="nav-icon">
            <MapIcon size={20} />
          </span>
          <span className="nav-label">Map</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
