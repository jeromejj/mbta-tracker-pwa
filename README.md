# Boston T Tracker

A lightweight, installable Progressive Web App (PWA) for tracking real-time MBTA subway and Silver Line arrivals in Boston. Built with React and Vite, this app focuses on speed and mobile usability.

## Features

* **Real-Time Predictions:** Live arrival times and active vehicle positions fetched directly from the [MBTA V3 API](https://api-v3.mbta.com/).
* **Multi-Line Support:**
    * Subway: Red, Orange, Blue, Green (B, C, D, E), Mattapan.
    * Bus: Silver Line (SL1, SL2, SL3, SL4, SL5, SLW).
* **Favorites System:** Save your most frequent station + line combinations for one-tap access (persists locally on your device).
* **"New Train" Tracker:** Automatically identifies and highlights new Red Line cars (CRRC #1900+) with a sparkle icon (`✨`).
* **Interactive Live Line Map:** Thermometer-style route map with Red Line Ashmont/Braintree branching and one-tap jump from any prediction pill to its live train position.
* **Service Alerts:** Displays active MBTA service alerts per line and on saved favorite cards.

## Tech Stack

* **Framework:** React 19
* **Build Tool:** Vite
* **Styling:** Pure CSS (CSS Variables, Flexbox)
* **Data Source:** MBTA V3 API
* **Storage:** `localStorage` (No database required)

## Getting Started

### Prerequisites
* Node.js (LTS version recommended)
* npm or yarn
* Optional (recommended): Free [MBTA V3 API Key](https://api-v3.mbta.com/) for higher rate limits.

### Installation

1. **Clone the repository**

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure API Key (Optional)**
   Create a `.env` file in the project root:
   ```env
   VITE_MBTA_API_KEY=your_mbta_api_key_here
   ```

4. **Run the local development server**
   ```bash
   npm run dev
   ```

### Testing on Mobile (Local Network)
To test on your phone while developing:
```bash
npm run dev -- --host
```
