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

// --- SUB-COMPONENT: SINGLE STOP ROW ---
const MapStopRow = ({ stop, vehicles, innerRef }) => {
  const trainsHere = vehicles.filter(v => v.stopId === stop.id);
  return (
    <div className="map-stop-row" ref={innerRef}>
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
const TrackSvg = ({ type, targets }) => {
  const [ref, { width, height }] = useContainerSize();
  const [targetsY, setTargetsY] = useState({ ashmont: 0, braintree: 0 });

  // Measure specific terminal positions for Red Line branches
  useEffect(() => {
    if (!targets || !ref.current) return;

    const measureTargets = () => {
      const containerRect = ref.current.getBoundingClientRect();
      const newY = { ashmont: height - 25, braintree: height - 25 }; // Default fallback

      if (targets.ashmont?.current) {
        const rect = targets.ashmont.current.getBoundingClientRect();
        // Calculate center of the row relative to SVG container
        newY.ashmont = (rect.top - containerRect.top) + (rect.height / 2);
      }
      if (targets.braintree?.current) {
        const rect = targets.braintree.current.getBoundingClientRect();
        newY.braintree = (rect.top - containerRect.top) + (rect.height / 2);
      }
      setTargetsY(newY);
    };

    // Measure immediately and on resize
    measureTargets();
    window.addEventListener('resize', measureTargets);
    // Also use a timeout to catch layout shifts after render
    const timer = setTimeout(measureTargets, 50);
    
    return () => {
      window.removeEventListener('resize', measureTargets);
      clearTimeout(timer);
    };
  }, [width, height, targets]);

  if (width === 0 || height === 0) return <div className="track-svg-layer" ref={ref} />;

  // --- GEOMETRY CONFIGURATION ---
  const STANDARD_AXIS = 30; 
  
  // RED LINE PERCENTAGES
  const TRUNK_AXIS = width * 0.40;  
  const ASHMONT_AXIS = width * 0.20; 
  const BRAINTREE_AXIS = width * 0.60; 
  
  const PAD = 25;     
  const SPLIT_H = 45; 
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
    
    // Use Measured Y positions to stop exactly at the station
    const ashmontEnd = targetsY.ashmont || (height - PAD);
    const braintreeEnd = targetsY.braintree || (height - PAD);

    // Ashmont Path
    paths.push(`
      M ${startX},0 
      C ${startX},25 ${ASHMONT_AXIS},20 ${ASHMONT_AXIS},${SPLIT_H}
      L ${ASHMONT_AXIS},${ashmontEnd}
    `);
    
    // Braintree Path
    paths.push(`
      M ${startX},0 
      C ${startX},25 ${BRAINTREE_AXIS},20 ${BRAINTREE_AXIS},${SPLIT_H}
      L ${BRAINTREE_AXIS},${braintreeEnd}
    `);
  }
  
  // 4. RED LINE MERGE (Inbound)
  else if (type === 'merge-inbound') {
    const endX = TRUNK_AXIS;
    
    // For inbound, we draw FROM the dots DOWN to the merge point
    paths.push(`
      M ${ASHMONT_AXIS},${PAD}
      L ${ASHMONT_AXIS},${height - SPLIT_H}
      C ${ASHMONT_AXIS},${height - 20} ${endX},${height - 25} ${endX},${height}
    `);
    
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
  
  // Refs to track the physical location of the last station in each branch
  const ashmontLastRef = useRef(null);
  const braintreeLastRef = useRef(null);

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
                
                {orderedAshmont.map(stop => <MapStopRow key={stop.id} stop={stop} vehicles={vehicles} />)}
              </div>
              <div className="branch-column braintree-col">
                
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
              {/* Pass the refs to the SVG so it knows where to stop drawing */}
              <TrackSvg 
                type="split-outbound" 
                targets={{ ashmont: ashmontLastRef, braintree: braintreeLastRef }} 
              />
              
              <div className="branch-column ashmont-col">
                <div className="branch-stop-spacer" style={{ height: 45 }}></div>
                {orderedAshmont.map((stop, i) => (
                  <MapStopRow 
                    key={stop.id} 
                    stop={stop} 
                    vehicles={vehicles}
                    // Attach Ref to LAST station only
                    innerRef={i === orderedAshmont.length - 1 ? ashmontLastRef : null}
                  />
                ))}
              </div>
              
              <div className="branch-column braintree-col">
                <div className="branch-stop-spacer" style={{ height: 45 }}></div>
                {orderedBraintree.map((stop, i) => (
                  <MapStopRow 
                    key={stop.id} 
                    stop={stop} 
                    vehicles={vehicles}
                    // Attach Ref to LAST station only
                    innerRef={i === orderedBraintree.length - 1 ? braintreeLastRef : null}
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
