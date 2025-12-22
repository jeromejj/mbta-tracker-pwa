# Boston T Tracker 🚇

A lightweight, installable Progressive Web App (PWA) for tracking real-time MBTA subway and Silver Line arrivals in Boston. Built with React and Vite, this app focuses on speed, mobile usability, and offline-first design.

## ✨ Features

* **Real-Time Predictions:** Live arrival times fetched directly from the [MBTA V3 API](https://api-v3.mbta.com/).
* **Multi-Line Support:**
    * Subway: Red, Orange, Blue, Green (B, C, D, E), Mattapan.
    * Bus: Silver Line (SL1, SL2, SL3, SL4, SL5).
* **Favorites System:** Save your most frequent stops for one-tap access (persists locally on your device).
* **"New Train" Tracker:** Automatically identifies and highlights new Red Line cars (CRRC #1900+) with a ✨ sparkle icon.
* **Mobile-First Design:**
    * Swipeable horizontal lists for arrival times.
    * Dynamic line colors (Red for Red Line, Orange for Orange Line, etc.).
    * Optimized for "Add to Home Screen" installation.

## 🛠️ Tech Stack

* **Framework:** React 18
* **Build Tool:** Vite
* **Styling:** Pure CSS (CSS Variables, Flexbox, Scroll Snap)
* **Data Source:** MBTA V3 API
* **Storage:** `localStorage` (No database required)

## 🚀 Getting Started

### Prerequisites
* Node.js (LTS version recommended)
* npm or yarn

### Installation

1.  **Clone the repository**
    ```bash
    git clone [https://github.com/yourusername/boston-t-tracker.git](https://github.com/yourusername/boston-t-tracker.git)
    cd boston-t-tracker
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Run the local development server**
    ```bash
    npm run dev
    ```
    The app will start at `http://localhost:5173`.

### Testing on Mobile (Local Network)
To test on your phone while developing:
```bash
npm run dev -- --host