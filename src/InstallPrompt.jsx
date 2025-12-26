import React, { useState, useEffect } from "react";
import "./InstallPrompt.css";

const InstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isFirefox, setIsFirefox] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if app is already installed (standalone mode)
    const isStandalone = window.matchMedia(
      "(display-mode: standalone)"
    ).matches;
    if (isStandalone) return;

    const ua = navigator.userAgent;

    // 1. Detect iOS
    const isIosDevice = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    if (isIosDevice) {
      setIsIOS(true);
      setTimeout(() => setIsVisible(true), 2000); // Small delay for effect
      return;
    }

    // 2. Detect Firefox on Android (No 'beforeinstallprompt' support)
    const isFirefoxAndroid = /Firefox/.test(ua) && /Android/.test(ua);
    if (isFirefoxAndroid) {
      setIsFirefox(true);
      setTimeout(() => setIsVisible(true), 2000);
      return;
    }

    // 3. Listen for standard 'beforeinstallprompt'
    // (Chrome/Edge/Samsung Internet)
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
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response: ${outcome}`);
    setDeferredPrompt(null);
    setIsVisible(false);
  };

  const handleClose = () => {
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="install-prompt">
      <div className="install-content">
        <div className="install-text">
          <h3>Install T Tracker for better experience</h3>

          {/* iOS Instructions */}
          {isIOS && (
            <p>
              Tap the <strong>Share</strong> button and select{" "}
              <strong>Add to Home Screen</strong>
            </p>
          )}

          {/* Firefox Android Instructions */}
          {isFirefox && (
            <p>
              Tap the <strong>Menu</strong> icon{" "}
              <span style={{ fontSize: "1.2em" }}>⋮</span> and select{" "}
              <strong>Add app to Home screen</strong>
            </p>
          )}

          {/* Standard Chrome/Edge Message */}
          {!isIOS && !isFirefox && <p></p>}
        </div>
      </div>

      <div className="install-actions">
        {/* Only show the magic button for Chrome/Edge/Samsung */}
        {!isIOS && !isFirefox && (
          <button className="install-btn" onClick={handleInstallClick}>
            Install
          </button>
        )}

        <button className="close-btn" onClick={handleClose}>
          {isIOS || isFirefox ? "Close" : "Not Now"}
        </button>
      </div>
    </div>
  );
};

export default InstallPrompt;
