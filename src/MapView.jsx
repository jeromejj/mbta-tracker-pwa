import React from 'react';

// --- CONFIGURATION ---
// Official IDs for the branches
const RED_LINE_ASHMONT = ['place-shmnl', 'place-fldcr', 'place-smmnl', 'place-asmnl'];
const RED_LINE_BRAINTREE = ['place-nqncy', 'place-wlsta', 'place-qnctr', 'place-qamnl', 'place-brntn'];

// --- SUB-COMPONENT: SINGLE STOP ROW ---
const MapStopRow = ({ stop, vehicles }) => {
  // Filter trains that are at this specific stop
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

// --- SUB-COMPONENT: BRANCH CONNECTOR ---
// This draws the lines connecting the Trunk to the Branches
const BranchConnector = () => (
  <div className="branch-connector-layer">
    {/* 1. Straight line extension for Ashmont (Left Side) */}
    <div className="connector-ashmont"></div>
    
    {/* 2. Rounded Corner for Braintree (Right Side) */}
    <div className="connector-braintree"></div>
  </div>
);

// --- MAIN MAP COMPONENT ---
const MapView = ({ route, stops, vehicles, onDirectionChange, directionId }) => {
  if (!route) return <div className="no-selection-msg">Please select a line above</div>;

  // Strict check: Only the actual "Red" line uses the branch visual.
  // Mattapan (which is also red colored) should be standard.
  const isRedLine = route.id === 'Red';

  // --- RENDERER: RED LINE (Trunk + Branches) ---
  const renderRedLine = () => {
    const trunkStops = [];
    const ashmontStops = [];
    const braintreeStops = [];

    // Split stops into the 3 sections
    stops.forEach(stop => {
      if (RED_LINE_ASHMONT.includes(stop.id)) {
        ashmontStops.push(stop);
      } else if (RED_LINE_BRAINTREE.includes(stop.id)) {
        braintreeStops.push(stop);
      } else {
        trunkStops.push(stop);
      }
    });

    const isOutbound = directionId === 0;

    // Determine render order based on direction
    const orderedTrunk = isOutbound ? trunkStops : [...trunkStops].reverse();
    const orderedAshmont = isOutbound ? ashmontStops : [...ashmontStops].reverse();
    const orderedBraintree = isOutbound ? braintreeStops : [...braintreeStops].reverse();

    return (
      <div className="thermometer red-line-layout">
        {/* INBOUND: Branches appear at the TOP (Simplified Merge) */}
        {!isOutbound && (
          <div className="branches-container inbound-merge">
            <div className="branch-column ashmont-col">
              <div className="branch-label">Ashmont</div>
              <div className="thermometer-line"></div>
              {orderedAshmont.map(stop => <MapStopRow key={stop.id} stop={stop} vehicles={vehicles} />)}
              {/* Spacer at bottom to connect to trunk */}
               <div className="branch-spacer"></div>
            </div>
            <div className="branch-column braintree-col">
              <div className="branch-label">Braintree</div>
              <div className="thermometer-line"></div>
              {orderedBraintree.map(stop => <MapStopRow key={stop.id} stop={stop} vehicles={vehicles} />)}
               <div className="branch-spacer"></div>
            </div>
          </div>
        )}

        {/* TRUNK: The shared section (Alewife <-> JFK) */}
        <div className="trunk-container">
          <div className="trunk-line"></div>
          {orderedTrunk.map(stop => <MapStopRow key={stop.id} stop={stop} vehicles={vehicles} />)}
        </div>

        {/* OUTBOUND: Branches appear at the BOTTOM (Split) */}
        {isOutbound && (
          <div className="branches-container outbound-split">
            {/* The Visual Curves */}
            <BranchConnector />
            
            <div className="branch-column ashmont-col">
              {/* Spacer to push content down below the connector curve */}
              <div className="branch-spacer"></div> 
              <div className="thermometer-line"></div>
              {orderedAshmont.map(stop => <MapStopRow key={stop.id} stop={stop} vehicles={vehicles} />)}
            </div>
            
            <div className="branch-column braintree-col">
              <div className="branch-spacer"></div>
              <div className="thermometer-line"></div>
              {orderedBraintree.map(stop => <MapStopRow key={stop.id} stop={stop} vehicles={vehicles} />)}
            </div>
          </div>
        )}
      </div>
    );
  };

  // --- RENDERER: STANDARD LINE (Vertical List) ---
  const renderStandardLine = () => {
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

export default MapView;
