# Local Threat Lens

Local Threat Lens is a local-first public safety dashboard built to help a person understand nearby risk conditions using public, open-source data. It is designed for browsers running on localhost and works without a private backend or restricted APIs.

## What the app does

The app combines a modern React interface with an Express backend to:

- detect the user’s location via browser geolocation when permission is granted
- query public weather data from Open-Meteo
- query nearby public map features from OpenStreetMap Overpass API
- estimate risk around the user using distance, severity, recency, and public activity
- display risk incidents on a map and in a signal list
- filter alerts by category
- estimate route safety for a destination before travel

## Features

- Live geolocation-aware dashboard
- Nearby risk and safety score overview
- Weather card with local conditions
- Interactive Leaflet map with markers and radius circle
- Severity-based alert detection and scoring
- Filterable incident list
- Route planning and risk estimation for destinations
- Public-data-only architecture suitable for localhost demo use

## Tech stack

- React
- Vite
- Express
- Leaflet
- OpenStreetMap
- Open-Meteo

## Local setup

From the project root:

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

The app runs with:
- frontend on port 3000
- backend API on port 4000

## API endpoints

- `GET /api/health`
- `GET /api/threats?lat=&lon=&radiusKm=`
- `GET /api/places?q=`
- `GET /api/route?startLat=&startLon=&endLat=&endLon=`

## Project goal

The goal of Local Threat Lens is to present a polished local safety dashboard that exposes nearby risk conditions in a simple, understandable way using only public data.
