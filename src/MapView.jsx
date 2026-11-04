import { useState, useRef, useEffect } from "react";
import "./MapView.css";

// --- CONFIGURATION ---
const RED_LINE_ASHMONT = [
  "place-shmnl",
  "place-fldcr",
  "place-smmnl",
  "place-asmnl",
];
const RED_LINE_BRAINTREE = [
  "place-nqncy",
  "place-wlsta",
  "place-qnctr",
  "place-qamnl",
  "place-brntn",
];

// --- HELPER: MEASURE CONTAINER SIZE ---
const useContainerSize = () => {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
};

// --- Clickable Row ---
const MapStopRow = ({
  stop,
  vehicles,
  innerRef,
  onStationSelect,
  highlightedTrainId,
}) => {
  const trainsHere = vehicles.filter((v) => v.stopId === stop.id);
  const handleKeyDown = (e) => {
    if ((e.key === "Enter" || e.key === " ") && onStationSelect) {
      e.preventDefault();
      onStationSelect(stop);
    }
  };

  return (
    <div
      className="map-stop-row"
      ref={innerRef}
      role="button"
      tabIndex={0}
      onClick={() => onStationSelect && onStationSelect(stop)}
      onKeyDown={handleKeyDown}
    >
      <div className="map-marker-area">
        <div className="stop-dot"></div>
        {trainsHere.map((train, idx) => {
          const offsetPx = -idx * 14;
          return (
            <div
              key={train.id}
              title={train.label ? `Train #${train.label}` : "Train"}
              style={
                offsetPx !== 0
                  ? { marginLeft: `${-14 + offsetPx}px` }
                  : undefined
              }
              className={`train-marker ${
                train.status === "IN_TRANSIT_TO" ? "moving" : ""
              } ${train.id === highlightedTrainId ? "highlighted" : ""}`}
            >
              <span className="train-icon">{train.isNew ? "✨" : "🚇"}</span>
            </div>
          );
        })}
      </div>
      <div className="map-stop-name">{stop.attributes.name}</div>
    </div>
  );
};

// --- SVG TRACK COMPONENT ---
const TrackSvg = ({ type, ashmontRef, braintreeRef, stopsCount }) => {
  const [ref, { width, height }] = useContainerSize();
  const [targetsY, setTargetsY] = useState({ ashmont: 0, braintree: 0 });

  useEffect(() => {
    if ((!ashmontRef && !braintreeRef) || !ref.current) return;

    const measureTargets = () => {
      if (!ref.current) return;
      const containerRect = ref.current.getBoundingClientRect();
      const defaultY = type === "merge-inbound" ? 25 : height - 25;
      const newY = { ashmont: defaultY, braintree: defaultY };

      if (ashmontRef?.current) {
        const rect = ashmontRef.current.getBoundingClientRect();
        newY.ashmont = rect.top - containerRect.top + rect.height / 2;
      }
      if (braintreeRef?.current) {
        const rect = braintreeRef.current.getBoundingClientRect();
        newY.braintree = rect.top - containerRect.top + rect.height / 2;
      }
      setTargetsY((prev) =>
        prev.ashmont === newY.ashmont && prev.braintree === newY.braintree
          ? prev
          : newY
      );
    };

    measureTargets();
    window.addEventListener("resize", measureTargets);
    const timer = setTimeout(measureTargets, 50);

    return () => {
      window.removeEventListener("resize", measureTargets);
      clearTimeout(timer);
    };
  }, [width, height, type, ref, ashmontRef, braintreeRef, stopsCount]);

  if (width === 0 || height === 0)
    return <div className="track-svg-layer" ref={ref} />;

  // --- GEOMETRY CONFIGURATION ---
  const STANDARD_AXIS = 42;
  const TRUNK_AXIS = width * 0.4;
  const ASHMONT_AXIS = width * 0.2;
  const BRAINTREE_AXIS = width * 0.6;

  const PAD = 25;
  const SPLIT_H = 45;
  const COLOR = "var(--line-color)";
  const STROKE = 4;
  const OPACITY = 0.3;

  let paths = [];

  if (type === "standard") {
    paths.push(`M ${STANDARD_AXIS},${PAD} L ${STANDARD_AXIS},${height - PAD}`);
  } else if (type === "trunk-outbound") {
    paths.push(`M ${TRUNK_AXIS},${PAD} L ${TRUNK_AXIS},${height}`);
  } else if (type === "trunk-inbound") {
    paths.push(`M ${TRUNK_AXIS},0 L ${TRUNK_AXIS},${height - PAD}`);
  } else if (type === "split-outbound") {
    const startX = TRUNK_AXIS;
    const ashmontEnd = targetsY.ashmont || height - PAD;
    const braintreeEnd = targetsY.braintree || height - PAD;

    paths.push(`
      M ${startX},0 
      C ${startX},25 ${ASHMONT_AXIS},20 ${ASHMONT_AXIS},${SPLIT_H}
      L ${ASHMONT_AXIS},${ashmontEnd}
    `);
    paths.push(`
      M ${startX},0 
      C ${startX},25 ${BRAINTREE_AXIS},20 ${BRAINTREE_AXIS},${SPLIT_H}
      L ${BRAINTREE_AXIS},${braintreeEnd}
    `);
  } else if (type === "merge-inbound") {
    const endX = TRUNK_AXIS;
    const ashmontStart = targetsY.ashmont || PAD;
    const braintreeStart = targetsY.braintree || PAD;
    paths.push(`
      M ${ASHMONT_AXIS},${ashmontStart}
      L ${ASHMONT_AXIS},${height - SPLIT_H}
      C ${ASHMONT_AXIS},${height - 20} ${endX},${height - 25} ${endX},${height}
    `);
    paths.push(`
      M ${BRAINTREE_AXIS},${braintreeStart}
      L ${BRAINTREE_AXIS},${height - SPLIT_H}
      C ${BRAINTREE_AXIS},${height - 20} ${endX},${
      height - 25
    } ${endX},${height}
    `);
  }

  return (
    <div className="track-svg-layer" ref={ref}>
      <svg width="100%" height="100%">
        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={COLOR}
            strokeWidth={STROKE}
            strokeOpacity={OPACITY}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </div>
  );
};

// --- MAIN MAP VIEW ---
const MapView = ({
  route,
  stops,
  vehicles,
  onDirectionChange,
  directionId,
  onStationSelect,
  highlightedTrainId,
}) => {
  const ashmontTargetRef = useRef(null);
  const braintreeTargetRef = useRef(null);
  const lastScrolledTrainRef = useRef(null);

  // AUTO-SCROLL TO HIGHLIGHTED TRAIN ONCE PER SELECTION
  useEffect(() => {
    if (!highlightedTrainId) {
      lastScrolledTrainRef.current = null;
      return;
    }
    if (lastScrolledTrainRef.current === highlightedTrainId) {
      return;
    }
    const timer = setTimeout(() => {
      const el = document.querySelector(".train-marker.highlighted");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        lastScrolledTrainRef.current = highlightedTrainId;
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [highlightedTrainId, vehicles, directionId]);

  if (!route)
    return <div className="no-selection-msg">Please select a line above</div>;

  const isRedLine = route.id === "Red";

  const renderRedLine = () => {
    const trunkStops = [];
    const ashmontStops = [];
    const braintreeStops = [];

    stops.forEach((stop) => {
      if (RED_LINE_ASHMONT.includes(stop.id)) ashmontStops.push(stop);
      else if (RED_LINE_BRAINTREE.includes(stop.id)) braintreeStops.push(stop);
      else trunkStops.push(stop);
    });

    const isOutbound = directionId === 0;
    const orderedTrunk = isOutbound ? trunkStops : [...trunkStops].reverse();
    const orderedAshmont = isOutbound
      ? ashmontStops
      : [...ashmontStops].reverse();
    const orderedBraintree = isOutbound
      ? braintreeStops
      : [...braintreeStops].reverse();

    return (
      <div className="thermometer red-line-layout">
        {!isOutbound && (
          <>
            <div className="branches-container inbound-merge">
              <TrackSvg
                type="merge-inbound"
                ashmontRef={ashmontTargetRef}
                braintreeRef={braintreeTargetRef}
                stopsCount={stops.length}
              />
              <div className="branch-column ashmont-col">
                {orderedAshmont.map((stop, i) => (
                  <MapStopRow
                    key={stop.id}
                    stop={stop}
                    vehicles={vehicles}
                    innerRef={i === 0 ? ashmontTargetRef : null}
                    onStationSelect={onStationSelect}
                    highlightedTrainId={highlightedTrainId}
                  />
                ))}
                <div
                  className="branch-stop-spacer"
                  style={{ height: 45 }}
                ></div>
              </div>
              <div className="branch-column braintree-col">
                {orderedBraintree.map((stop, i) => (
                  <MapStopRow
                    key={stop.id}
                    stop={stop}
                    vehicles={vehicles}
                    innerRef={i === 0 ? braintreeTargetRef : null}
                    onStationSelect={onStationSelect}
                    highlightedTrainId={highlightedTrainId}
                  />
                ))}
                <div
                  className="branch-stop-spacer"
                  style={{ height: 45 }}
                ></div>
              </div>
            </div>
            <div className="trunk-container">
              <TrackSvg type="trunk-inbound" stopsCount={stops.length} />
              {orderedTrunk.map((stop) => (
                <MapStopRow
                  key={stop.id}
                  stop={stop}
                  vehicles={vehicles}
                  onStationSelect={onStationSelect}
                  highlightedTrainId={highlightedTrainId}
                />
              ))}
            </div>
          </>
        )}

        {isOutbound && (
          <>
            <div className="trunk-container">
              <TrackSvg type="trunk-outbound" stopsCount={stops.length} />
              {orderedTrunk.map((stop) => (
                <MapStopRow
                  key={stop.id}
                  stop={stop}
                  vehicles={vehicles}
                  onStationSelect={onStationSelect}
                  highlightedTrainId={highlightedTrainId}
                />
              ))}
            </div>
            <div className="branches-container outbound-split">
              <TrackSvg
                type="split-outbound"
                ashmontRef={ashmontTargetRef}
                braintreeRef={braintreeTargetRef}
                stopsCount={stops.length}
              />

              <div className="branch-column ashmont-col">
                <div
                  className="branch-stop-spacer"
                  style={{ height: 45 }}
                ></div>
                {orderedAshmont.map((stop, i) => (
                  <MapStopRow
                    key={stop.id}
                    stop={stop}
                    vehicles={vehicles}
                    innerRef={
                      i === orderedAshmont.length - 1 ? ashmontTargetRef : null
                    }
                    onStationSelect={onStationSelect}
                    highlightedTrainId={highlightedTrainId}
                  />
                ))}
              </div>

              <div className="branch-column braintree-col">
                <div
                  className="branch-stop-spacer"
                  style={{ height: 45 }}
                ></div>
                {orderedBraintree.map((stop, i) => (
                  <MapStopRow
                    key={stop.id}
                    stop={stop}
                    vehicles={vehicles}
                    innerRef={
                      i === orderedBraintree.length - 1
                        ? braintreeTargetRef
                        : null
                    }
                    onStationSelect={onStationSelect}
                    highlightedTrainId={highlightedTrainId}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderStandardLine = () => {
    const displayStops = directionId === 1 ? [...stops].reverse() : stops;
    return (
      <div className="thermometer">
        <TrackSvg type="standard" />
        {displayStops.map((stop) => (
          <MapStopRow
            key={stop.id}
            stop={stop}
            vehicles={vehicles}
            onStationSelect={onStationSelect}
            highlightedTrainId={highlightedTrainId}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="map-container fade-in">
      <div className="direction-toggle">
        <label>Direction</label>
        <div className="toggle-row">
          <button
            className={directionId === 0 ? "active" : ""}
            onClick={() => onDirectionChange(0)}
          >
            {route.attributes.direction_names[0]}
          </button>
          <button
            className={directionId === 1 ? "active" : ""}
            onClick={() => onDirectionChange(1)}
          >
            {route.attributes.direction_names[1]}
          </button>
        </div>
      </div>
      {isRedLine ? renderRedLine() : renderStandardLine()}
    </div>
  );
};

export default MapView;
