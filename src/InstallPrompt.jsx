import React, { useState, useEffect } from "react";
import "./InstallPrompt.css";

const InstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // 1. Check if user is on iOS
    const isIosDevice =
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    // Check if already in "standalone" (installed) mode to avoid showing it unnecessarily
    const isStandalone = window.matchMedia(
      "(display-mode: standalone)"
    ).matches;

    if (isIosDevice && !isStandalone) {
      setIsIOS(true);
      // Optional: Show iOS prompt after a small delay
      setTimeout(() => setIsVisible(true), 2000);
    }

    // 2. Listen for the 'beforeinstallprompt' event (Android/Desktop)
    const handleBeforeInstallPrompt = (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      // Update UI notify the user they can install the PWA
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

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);

    // We've used the prompt, and can't use it again, discard it
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
          {isIOS ? (
            <p>
              Tap the <strong>Share</strong> button and select{" "}
              <strong>"Add to Home Screen"</strong>
            </p>
          ) : (
            <p></p>
          )}
        </div>
      </div>

      <div className="install-actions">
        {!isIOS && (
          <button className="install-btn" onClick={handleInstallClick}>
            Install
          </button>
        )}
        <button className="close-btn" onClick={handleClose}>
          {isIOS ? "Close" : "Not Now"}
        </button>
      </div>
    </div>
  );
};

export default InstallPrompt;
