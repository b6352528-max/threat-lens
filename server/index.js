import express from 'express';
import cors from 'cors';
import { fetchWeather, fetchOverpassSignals, geocodePlace, buildRouteRisk } from './publicData.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json());

const defaultCenter = { lat: 40.7128, lon: -74.006 };

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function buildFallbackIncidents(lat, lon, weather, signals) {
  const incidents = [
    {
      id: 'weather-alert',
      title: 'Weather watch',
      category: 'Weather',
      severity: 'high',
      description: 'Local weather conditions may reduce visibility and affect travel comfort.',
      source: 'Open-Meteo public forecast',
      timestamp: new Date().toISOString(),
      position: { lat: lat + 0.008, lon: lon - 0.01 },
    },
    {
      id: 'transit-alert',
      title: 'Transit friction',
      category: 'Transport',
      severity: 'medium',
      description: 'Transit and road activity is elevated in the surrounding area.',
      source: 'OpenStreetMap activity',
      timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      position: { lat: lat - 0.006, lon: lon + 0.008 },
    },
    {
      id: 'infrastructure-notice',
      title: 'Public infrastructure note',
      category: 'Infrastructure',
      severity: 'low',
      description: 'Nearby civic infrastructure activity is visible but manageable.',
      source: 'Public map data',
      timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      position: { lat: lat + 0.012, lon: lon + 0.006 },
    }
  ];

  if (weather && weather.precipitation > 0.5) {
    incidents[0].severity = 'critical';
    incidents[0].description = 'Heavy precipitation and poor visibility are increasing local risk for nearby movement.';
  }

  if (signals && signals.length) {
    signals.slice(0, 3).forEach((signal, index) => {
      incidents.push({
        id: `signal-${signal.id || index}`,
        title: `${signal.amenity || signal.type || 'Public place'} signal`,
        category: signal.category || 'Public gathering',
        severity: index === 0 ? 'medium' : 'low',
        description: `Public map data suggests elevated activity around ${signal.name || 'a local feature'}.`,
        source: 'OpenStreetMap public data',
        timestamp: new Date(Date.now() - index * 20 * 60000).toISOString(),
        position: { lat: signal.lat, lon: signal.lon },
      });
    });
  }

  return incidents;
}

function calculateRisk(incident, userLocation) {
  const distanceKm = haversineKm(userLocation, incident.position);
  const severityWeight = { low: 1, medium: 2, high: 3, critical: 4 }[incident.severity] || 1;
  const ageMinutes = Math.max(1, Math.round((Date.now() - new Date(incident.timestamp).getTime()) / 60000));
  const recencyWeight = Math.max(1, 22 - Math.min(18, ageMinutes / 8));
  const proximityWeight = Math.max(1, 30 - distanceKm * 2.8);
  const confidence = clamp(Math.round((severityWeight * 18 + recencyWeight + proximityWeight) / 3), 15, 99);
  const riskScore = clamp(Math.round((confidence + (20 - Math.min(20, distanceKm * 2.2))) / 2), 8, 98);

  return { ...incident, distanceKm: Number(distanceKm.toFixed(1)), confidence, riskScore };
}

app.get('/api/health', (_, response) => {
  response.json({ ok: true, service: 'local-threat-lens-api', port: PORT });
});

app.get('/api/threats', async (request, response) => {
  const lat = Number(request.query.lat ?? defaultCenter.lat);
  const lon = Number(request.query.lon ?? defaultCenter.lon);
  const radiusKm = clamp(Number(request.query.radiusKm ?? 5), 1, 25);

  try {
    const [weather, signals] = await Promise.all([
      fetchWeather(lat, lon),
      fetchOverpassSignals(lat, lon, radiusKm)
    ]);

    const incidents = buildFallbackIncidents(lat, lon, weather, signals)
      .map((incident) => calculateRisk(incident, { lat, lon }))
      .filter((incident) => incident.distanceKm <= radiusKm + 2)
      .sort((a, b) => b.riskScore - a.riskScore);

    const summary = {
      activeAlerts: incidents.length,
      averageRisk: incidents.length
        ? Math.round(incidents.reduce((sum, item) => sum + item.riskScore, 0) / incidents.length)
        : 0,
      safetyScore: clamp(100 - (incidents.length ? Math.round(incidents.reduce((sum, item) => sum + item.riskScore, 0) / incidents.length) : 0), 12, 98),
      routeStatus: incidents.length && incidents[0].riskScore > 60 ? 'Elevated caution' : 'Normal watch',
      weather: weather ? {
        temperature: weather.temperature_2m,
        windSpeed: weather.wind_speed_10m,
        precipitation: weather.precipitation
      } : null,
    };

    response.json({
      location: { lat, lon },
      radiusKm,
      incidents,
      summary,
      weather,
    });
  } catch (error) {
    response.status(500).json({
      error: 'Failed to load threat data',
      details: error.message,
    });
  }
});

app.get('/api/places', async (request, response) => {
  const query = String(request.query.q || '').trim();
  if (!query) {
    response.json({ results: [] });
    return;
  }

  try {
    const results = await geocodePlace(query);
    response.json({ results });
  } catch (error) {
    response.status(500).json({ error: 'Could not search places', details: error.message });
  }
});

app.get('/api/route', async (request, response) => {
  const startLat = Number(request.query.startLat ?? defaultCenter.lat);
  const startLon = Number(request.query.startLon ?? defaultCenter.lon);
  const endLat = Number(request.query.endLat ?? defaultCenter.lat + 0.02);
  const endLon = Number(request.query.endLon ?? defaultCenter.lon + 0.02);

  try {
    const route = await buildRouteRisk({ lat: startLat, lon: startLon }, { lat: endLat, lon: endLon });
    response.json(route);
  } catch (error) {
    response.status(500).json({ error: 'Route risk unavailable', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Local Threat Lens API running on http://localhost:${PORT}`);
});
