import React, { useState, useRef, useEffect } from 'react';
import './MapView.css';

// --- CONFIGURATION ---
const RED_LINE_ASHMONT = ['place-shmnl', 'place-fldcr', 'place-smmnl', 'place-asmnl'];
const RED_LINE_BRAINTREE = ['place-nqncy', 'place-wlsta', 'place-qnctr', 'place-qamnl', 'place-brntn'];

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

// --- SVG TRACK COMPONENT ---
const TrackSvg = ({ type }) => {
  const [ref, { width, height }] = useContainerSize();

  if (width === 0 || height === 0) return <div className="track-svg-layer" ref={ref} />;

  // --- GEOMETRY CONFIGURATION ---
  const STANDARD_AXIS = 30; // Orange/Blue lines stay at 30px
  
  // RED LINE PERCENTAGES
  const TRUNK_AXIS = width * 0.40;  // Trunk at 40%
  const ASHMONT_AXIS = width * 0.20; // Ashmont at 20%
  const BRAINTREE_AXIS = width * 0.60; // Braintree at 60%
  
  const PAD = 25;     // Center of first/last dot
  const SPLIT_H = 45; // Height of curve area
  const COLOR = "var(--line-color)";
  const STROKE = 4;
  const OPACITY = 0.3;

  let paths = [];

  // 1. STANDARD LINES
  if (type === 'standard') {
    paths.push(`M ${STANDARD_AXIS},${PAD} L ${STANDARD_AXIS},${height - PAD}`);
  } 
  
  // 2. RED LINE TRUNK (40%)
  else if (type === 'trunk-outbound') {
    paths.push(`M ${TRUNK_AXIS},${PAD} L ${TRUNK_AXIS},${height}`);
  }
  else if (type === 'trunk-inbound') {
    paths.push(`M ${TRUNK_AXIS},0 L ${TRUNK_AXIS},${height - PAD}`);
  }
  
  // 3. RED LINE SPLIT (Outbound)
  else if (type === 'split-outbound') {
    const startX = TRUNK_AXIS;
    
    // Ashmont: Curve Left (40% -> 20%)
    paths.push(`
      M ${startX},0 
      C ${startX},25 ${ASHMONT_AXIS},20 ${ASHMONT_AXIS},${SPLIT_H}
      L ${ASHMONT_AXIS},${height - PAD}
    `);
    
    // Braintree: Curve Right (40% -> 60%)
    paths.push(`
      M ${startX},0 
      C ${startX},25 ${BRAINTREE_AXIS},20 ${BRAINTREE_AXIS},${SPLIT_H}
      L ${BRAINTREE_AXIS},${height - PAD}
    `);
  }
  
  // 4. RED LINE MERGE (Inbound)
  else if (type === 'merge-inbound') {
    const endX = TRUNK_AXIS;
    
    // Ashmont: Curve Right (20% -> 40%)
    paths.push(`
      M ${ASHMONT_AXIS},${PAD}
      L ${ASHMONT_AXIS},${height - SPLIT_H}
      C ${ASHMONT_AXIS},${height - 20} ${endX},${height - 25} ${endX},${height}
    `);
    
    // Braintree: Curve Left (60% -> 40%)
    paths.push(`
      M ${BRAINTREE_AXIS},${PAD}
      L ${BRAINTREE_AXIS},${height - SPLIT_H}
      C ${BRAINTREE_AXIS},${height - 20} ${endX},${height - 25} ${endX},${height}
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
