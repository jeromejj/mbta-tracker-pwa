import { useState, useRef, useEffect } from "react";
import "./Favorite.css";

const getFavoriteKey = (routeId, stopId) => `${routeId}:${stopId}`;

// --- REUSABLE COMPONENT: PREDICTION CARD ---
export const PredictionCard = ({
  title,
  subtitle,
  groups,
  onStarClick,
  onTrainClick,
  isFav,
  lineColor,
  extra,
  alerts,
  loading,
}) => {
  const [showAlerts, setShowAlerts] = useState(false);
  const hasAlerts = alerts && alerts.length > 0;

  return (
    <div
      className="destination-card"
      style={{ borderLeft: `6px solid ${lineColor}` }}
    >
      <div className="predictions-header">
        <div className="predictions-title-group">
          <h2>
            <span>{title}</span>
            {hasAlerts && (
              <button
                type="button"
                className="alert-icon-fav"
                title="Toggle Service Alert details"
                aria-label="Toggle Service Alert details"
                aria-expanded={showAlerts}
                onClick={() => setShowAlerts((prev) => !prev)}
              >
                ⚠️
              </button>
            )}
            {onStarClick && (
              <button
                type="button"
                className="star-btn"
                aria-label={
                  isFav ? "Remove station from favorites" : "Add station to favorites"
                }
                onClick={onStarClick}
              >
                {isFav ? "★" : "☆"}
              </button>
            )}
          </h2>
          {subtitle && (
            <span
              className="route-badge"
              style={{
                backgroundColor: `color-mix(in srgb, ${lineColor}, white 88%)`,
                color: lineColor,
                borderColor: `color-mix(in srgb, ${lineColor}, white 60%)`,
              }}
            >
              {subtitle}
            </span>
          )}
        </div>
        {extra}
      </div>

      {hasAlerts && showAlerts && (
        <div className="fav-alerts-panel">
          {alerts.map((alert) => (
            <div key={alert.id} className="alert-box">
              <span className="alert-icon">⚠️</span>
              <div className="alert-content">
                <strong>
                  {alert.attributes?.service_effect || "Service Alert"}
                </strong>
                <p>{alert.attributes?.header}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="destinations-list">
        {loading && (!groups || groups.length === 0) ? (
          <p className="no-data">Loading predictions...</p>
        ) : groups && groups.length > 0 ? (
          groups.map((dirGroup) => (
            <div key={dirGroup.directionId} className="direction-section">
              <h4 className="direction-label">{dirGroup.direction}</h4>
              {dirGroup.groups.map((group) => (
                <div key={group.name} className="destination-group">
                  <h3 className="destination-heading">
                    {group.branches &&
                      group.branches.map((branch) => (
                        <span key={branch} className="branch-badge">
                          {branch}
                        </span>
                      ))}
                    <span>{group.name}</span>
                  </h3>
                  <div className="train-row-container">
                    {group.trains.map((t) => (
                      <button
                        type="button"
                        key={t.id}
                        className="train-pill"
                        onClick={() => onTrainClick && onTrainClick(t)}
                        disabled={!t.vehicleId}
                        title={
                          t.vehicleId
                            ? "View this train on the live map"
                            : "Live vehicle position unavailable"
                        }
                        style={{
                          backgroundColor: `color-mix(in srgb, ${lineColor}, white 90%)`,
                          borderColor: lineColor,
                          color: lineColor,
                          cursor: t.vehicleId ? "pointer" : "default",
                        }}
                      >
                        <span className="time">
                          {group.branches?.length > 1 && t.branch && (
                            <span className="pill-branch-tag">{t.branch}</span>
                          )}
                          {t.minutes}
                          {t.isNew && <span className="new-badge">✨</span>}
                        </span>
                      </button>
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
};

// --- MAIN FAVORITES VIEW ---
const FavoritesTab = ({
  favorites,
  favoritePredictions,
  favoriteAlerts,
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

  const scrollToFav = (favKey) => {
    const el = document.getElementById(`fav-${favKey}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (favorites.length === 0) {
    return (
      <div className="favorites-view fade-in">
        <div className="no-data-msg">
          <p>No favorites yet.</p>
          <small>
            Go to the Search or Map tab and tap the star (☆) to save stations
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
          {favorites.map((fav) => {
            const favKey = getFavoriteKey(fav.routeId, fav.stopId);
            return (
              <button
                type="button"
                key={favKey}
                className="fav-chip"
                onClick={() => scrollToFav(favKey)}
                style={{ "--chip-color": getLineColor(fav.routeId) }}
              >
                <span className="fav-route-dot"></span>
                {fav.stopName}
              </button>
            );
          })}
        </div>
      </div>

      <div className="fav-cards-list">
        {favorites.map((fav) => {
          const favKey = getFavoriteKey(fav.routeId, fav.stopId);
          const alertsForFav = favoriteAlerts?.[favKey] || [];
          return (
            <div
              key={favKey}
              id={`fav-${favKey}`}
              className="fav-section"
            >
              <PredictionCard
                title={fav.stopName}
                subtitle={fav.routeName || fav.routeId}
                alerts={alertsForFav}
                groups={
                  favoritePredictions[favKey] ??
                  favoritePredictions[fav.stopId]
                }
                isFav={true}
                onStarClick={() =>
                  toggleFavorite(
                    { id: fav.stopId, attributes: { name: fav.stopName } },
                    {
                      id: fav.routeId,
                      attributes: { long_name: fav.routeName || fav.routeId },
                    }
                  )
                }
                onTrainClick={onTrainClick}
                lineColor={getLineColor(fav.routeId)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FavoritesTab;
