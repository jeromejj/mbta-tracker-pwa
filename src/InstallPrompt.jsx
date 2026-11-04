import { useState, useEffect } from "react";
import "./InstallPrompt.css";

const DISMISS_STORAGE_KEY = "mbta_install_dismissed";

const detectPlatform = () => {
  if (typeof window === "undefined") {
    return { isStandalone: false, isIOS: false, isFirefox: false };
  }
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  const ua = navigator.userAgent || "";
  const isIOS =
    (/iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) &&
    !window.MSStream;
  const isFirefox = /Firefox/.test(ua) && /Android/.test(ua);

  return { isStandalone, isIOS, isFirefox };
};

const InstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [{ isStandalone, isIOS, isFirefox }] = useState(detectPlatform);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isStandalone) return;

    try {
      if (localStorage.getItem(DISMISS_STORAGE_KEY) === "true") {
        return;
      }
    } catch {
      // Ignore storage access errors in private browsing
    }

    if (isIOS || isFirefox) {
      const timer = setTimeout(() => setIsVisible(true), 2000);
      return () => clearTimeout(timer);
    }

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
    };
  }, [isStandalone, isIOS, isFirefox]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setIsVisible(false);
  };

  const handleClose = () => {
    setIsVisible(false);
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, "true");
    } catch {
      // Ignore storage access errors
    }
  };

  if (!isVisible) return null;

  return (
    <div className="install-prompt">
      <div className="install-content">
        <div className="install-text">
          <h3>Install T Tracker for a better experience</h3>

          {isIOS && (
            <p>
              Tap the <strong>Share</strong> button and select{" "}
              <strong>Add to Home Screen</strong>
            </p>
          )}

          {isFirefox && (
            <p>
              Tap the <strong>Menu</strong> icon{" "}
              <span style={{ fontSize: "1.2em" }}>⋮</span> and select{" "}
              <strong>Add app to Home screen</strong>
            </p>
          )}

          {!isIOS && !isFirefox && (
            <p>Add to your home screen for quick one-tap access.</p>
          )}
        </div>
      </div>

      <div className="install-actions">
        {!isIOS && !isFirefox && (
          <button
            type="button"
            className="install-btn"
            onClick={handleInstallClick}
          >
            Install
          </button>
        )}

        <button type="button" className="close-btn" onClick={handleClose}>
          {isIOS || isFirefox ? "Close" : "Not Now"}
        </button>
      </div>
    </div>
  );
};

export default InstallPrompt;
