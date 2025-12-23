import React, { useState, useRef, useEffect } from 'react';
import './MapView.css';

// --- CONFIGURATION ---
const RED_LINE_ASHMONT = ['place-shmnl', 'place-fldcr', 'place-smmnl', 'place-asmnl'];
const RED_LINE_BRAINTREE = ['place-nqncy', 'place-wlsta', 'place-qnctr', 'place-qamnl', 'place-brntn'];

// --- HELPER: MEASURE CONTAINER SIZE ---
const useContainerSize = () => {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height
      });
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
};

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

// --- UNIFIED SVG TRACK COMPONENT ---
const TrackSvg = ({ type }) => {
  const [ref, { width, height }] = useContainerSize();

  if (width === 0 || height === 0) return <div className="track-svg-layer" ref={ref} />;

  // GEOMETRY
  const AXIS = 30;          // Center of left track (pixels)
  const PAD = 25;           // Center of first/last dot (50px row / 2)
  const SPLIT_H = 45;       // Height of the split curve
  const COLOR = "var(--line-color)";
  const STROKE = 4;
  const OPACITY = 0.3;

  let paths = [];

  // --- LOGIC: BUILD PATHS ---
  if (type === 'standard') {
    // Start at first dot, end at last dot
    paths.push(`M ${AXIS},${PAD} L ${AXIS},${height - PAD}`);
  } 
  
  else if (type === 'trunk-outbound') {
    // Start at first dot, go flush to bottom
    paths.push(`M ${AXIS},${PAD} L ${AXIS},${height}`);
  }
  
  else if (type === 'trunk-inbound') {
    // Start flush at top, go to last dot
    paths.push(`M ${AXIS},0 L ${AXIS},${height - PAD}`);
  }
  
  else if (type === 'split-outbound') {
    const braintreeX = width * 0.75; // Center of right column
    
    // 1. Ashmont: Straight down (Top -> Last Dot)
    paths.push(`M ${AXIS},0 L ${AXIS},${height - PAD}`);
    
    // 2. Braintree: Curve (Top -> Last Dot in Right Column)
    // Curve ends at SPLIT_H, then straight line down
    paths.push(`
      M ${AXIS},0 
      C ${AXIS},25 ${braintreeX},20 ${braintreeX},${SPLIT_H}
      L ${braintreeX},${height - PAD}
    `);
  }
  
  else if (type === 'merge-inbound') {
    const braintreeX = width * 0.75;
    
    // 1. Ashmont: Straight up (Bottom -> First Dot)
    paths.push(`M ${AXIS},${height} L ${AXIS},${PAD}`);
    
    // 2. Braintree: Curve (Bottom -> First Dot in Right Column)
    // Draw from Dot down to curve start, then curve to bottom
    paths.push(`
      M ${braintreeX},${PAD}
      L ${braintreeX},${height - SPLIT_H}
      C ${braintreeX},${height - 20} ${AXIS},${height - 25} ${AXIS},${height}
    `);
  }

  return (
    <div className="track-svg-layer" ref={ref}>
      <svg width="100%" height="100%">
        {paths.map((d, i) => (
          <path 
            key={i} d={d} fill="none" 
            stroke={COLOR} strokeWidth={STROKE} strokeOpacity={OPACITY} 
            strokeLinecap="round" strokeLinejoin="round" 
          />
        ))}
      </svg>
    </div>
  );
};

const MapView = ({ route, stops, vehicles, onDirectionChange, directionId }) => {
  if (!route) return <div className="no-selection-msg">Please select a line above</div>;

  const isRedLine = route.id === 'Red';

  const renderRedLine = () => {
    const trunkStops = [];
    const ashmontStops = [];
    const braintreeStops = [];

    stops.forEach(stop => {
      if (RED_LINE_ASHMONT.includes(stop.id)) ashmontStops.push(stop);
      else if (RED_LINE_BRAINTREE.includes(stop.id)) braintreeStops.push(stop);
      else trunkStops.push(stop);
    });

    const isOutbound = directionId === 0;
    const orderedTrunk = isOutbound ? trunkStops : [...trunkStops].reverse();
    const orderedAshmont = isOutbound ? ashmontStops : [...ashmontStops].reverse();
    const orderedBraintree = isOutbound ? braintreeStops : [...braintreeStops].reverse();

    return (
      <div className="thermometer red-line-layout">
        {!isOutbound && (
          <>
            <div className="branches-container inbound-merge">
              <TrackSvg type="merge-inbound" />
              <div className="branch-column ashmont-col">
                <div className="branch-label">Ashmont</div>
                {orderedAshmont.map(stop => <MapStopRow key={stop.id} stop={stop} vehicles={vehicles} />)}
              </div>
              <div className="branch-column braintree-col">
                <div className="branch-label">Braintree</div>
                {orderedBraintree.map(stop => <MapStopRow key={stop.id} stop={stop} vehicles={vehicles} />)}
              </div>
            </div>
            <div className="trunk-container">
              <TrackSvg type="trunk-inbound" />
              {orderedTrunk.map(stop => <MapStopRow key={stop.id} stop={stop} vehicles={vehicles} />)}
            </div>
          </>
        )}

        {isOutbound && (
          <>
            <div className="trunk-container">
              <TrackSvg type="trunk-outbound" />
              {orderedTrunk.map(stop => <MapStopRow key={stop.id} stop={stop} vehicles={vehicles} />)}
            </div>
            <div className="branches-container outbound-split">
              <TrackSvg type="split-outbound" />
              <div className="branch-column ashmont-col">
                <div className="branch-stop-spacer" style={{ height: 45 }}></div>
                {orderedAshmont.map(stop => <MapStopRow key={stop.id} stop={stop} vehicles={vehicles} />)}
              </div>
              <div className="branch-column braintree-col">
                <div className="branch-stop-spacer" style={{ height: 45 }}></div>
                {orderedBraintree.map(stop => <MapStopRow key={stop.id} stop={stop} vehicles={vehicles} />)}
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
        {/* Unified SVG for standard lines too */}
        <TrackSvg type="standard" />
        {displayStops.map(stop => <MapStopRow key={stop.id} stop={stop} vehicles={vehicles} />)}
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

export default MapView;
