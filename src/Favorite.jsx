import React from "react";
import "./Favorite.css";

// --- REUSABLE COMPONENT: PREDICTION CARD ---
// Exported so App.jsx can use it for the Search view too
export const PredictionCard = ({
  title,
  groups,
  onStarClick,
  isFav,
  lineColor,
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
    </div>

    <div className="destinations-list">
      {groups && groups.length > 0 ? (
        groups.map((group) => (
          <div key={group.name} className="destination-group">
            <h3>To {group.name}</h3>
            <div className="train-row-container">
              {group.trains.map((t) => (
                <div
                  key={t.id}
                  className="train-pill"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${lineColor}, white 90%)`,
                    borderColor: lineColor,
                    color: lineColor,
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
}) => {
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
      {/* 1. Sticky Quick Jump Header */}
      <div className="favorites-container sticky-header">
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

      {/* 2. Scrollable List of Cards */}
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
              lineColor={getLineColor(fav.routeId)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default FavoritesTab;
