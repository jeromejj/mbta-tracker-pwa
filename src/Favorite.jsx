import React, { useState, useRef, useEffect } from "react";
import "./Favorite.css";

// --- REUSABLE COMPONENT: PREDICTION CARD ---
export const PredictionCard = ({
  title,
  groups,
  onStarClick,
  onTrainClick,
  isFav,
  lineColor,
  extra,
}) => (
  <div
    className="destination-card"
    style={{ borderLeft: `6px solid ${lineColor}` }}
  >
    <div className="predictions-header">
      <h2>
        {title}
        {onStarClick && (
          <button className="star-btn" onClick={onStarClick}>
            {isFav ? "★" : "☆"}
          </button>
        )}
      </h2>
      {extra}
    </div>

    <div className="destinations-list">
      {groups && groups.length > 0 ? (
        groups.map((dirGroup) => (
          <div key={dirGroup.directionId} className="direction-section">
            <h4 className="direction-label">{dirGroup.direction}</h4>
            {dirGroup.groups.map((group) => (
              <div key={group.name} className="destination-group">
                <h3>{group.name}</h3>
                <div className="train-row-container">
                  {group.trains.map((t) => (
                    <div
                      key={t.id}
                      className="train-pill"
                      // CLICK HANDLER
                      onClick={() => onTrainClick && onTrainClick(t)}
                      style={{
                        backgroundColor: `color-mix(in srgb, ${lineColor}, white 90%)`,
                        borderColor: lineColor,
                        color: lineColor,
                        cursor: "pointer", // Show interactivity
                      }}
                    >
                      <span className="time">
                        {t.minutes}
                        {t.isNew && <span className="new-badge">✨</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))
      ) : (
        <p className="no-data">No trains predicted</p>
      )}
    </div>
  </div>
);

// --- MAIN FAVORITES VIEW ---
const FavoritesTab = ({
  favorites,
  favoritePredictions,
  toggleFavorite,
  getLineColor,
  onTrainClick,
}) => {
  const [isStuck, setIsStuck] = useState(false);
  const sentinelRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsStuck(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: "-1px 0px 0px 0px" }
    );

    if (sentinelRef.current) {
      observer.observe(sentinelRef.current);
    }
    return () => observer.disconnect();
  }, []);

  const scrollToFav = (stopId) => {
    const el = document.getElementById(`fav-${stopId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (favorites.length === 0) {
    return (
      <div className="favorites-view fade-in">
        <div className="no-data-msg">
          <p>No favorites yet.</p>
          <small>
            Go to the Search or Map tab and tap the star (★) to save stations
            here.
          </small>
        </div>
      </div>
    );
  }

  return (
    <div className="favorites-view fade-in">
      <div ref={sentinelRef} className="sticky-sentinel" />

      <div
        className={`favorites-container sticky-header ${
          isStuck ? "stuck" : ""
        }`}
      >
        <div className="favorites-label">QUICK JUMP</div>
        <div className="favorites-list">
          {favorites.map((fav) => (
            <button
              key={fav.stopId}
              className="fav-chip"
              onClick={() => scrollToFav(fav.stopId)}
              style={{ "--chip-color": getLineColor(fav.routeId) }}
            >
              <span className="fav-route-dot"></span>
              {fav.stopName}
            </button>
          ))}
        </div>
      </div>

      <div className="fav-cards-list">
        {favorites.map((fav) => (
          <div
            key={fav.stopId}
            id={`fav-${fav.stopId}`}
            className="fav-section"
          >
            <PredictionCard
              title={fav.stopName}
              groups={favoritePredictions[fav.stopId]}
              isFav={true}
              onStarClick={() =>
                toggleFavorite(
                  { id: fav.stopId, attributes: { name: fav.stopName } },
                  { id: fav.routeId }
                )
              }
              onTrainClick={onTrainClick} // <--- Pass down
              lineColor={getLineColor(fav.routeId)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default FavoritesTab;
