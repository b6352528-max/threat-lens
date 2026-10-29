const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,precipitation,wind_speed_10m',
    timezone: 'auto',
  });

  const response = await fetch(`${WEATHER_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Weather API request failed');
  }

  const payload = await response.json();
  return payload.current || null;
}

export async function fetchOverpassSignals(lat, lon, radiusKm = 5) {
  const radiusMeters = Math.round(radiusKm * 1000);
  const query = `
    [out:json][timeout:25];
    (
      node(around:${radiusMeters},${lat},${lon})["amenity"];
      way(around:${radiusMeters},${lat},${lon})["amenity"];
      node(around:${radiusMeters},${lat},${lon})["leisure"];
    );
    out center 20;
  `;

  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error('Overpass request failed');
  }

  const payload = await response.json();
  const elements = payload.elements || [];

  return elements
    .map((element) => {
      const tags = element.tags || {};
      const latValue = element.lat ?? (element.center ? element.center.lat : null);
      const lonValue = element.lon ?? (element.center ? element.center.lon : null);
      if (!latValue || !lonValue) return null;

      const category = tags.amenity || tags.leisure || 'Public place';
      return {
        id: `${category}-${element.id}`,
        name: tags.name || 'Public place',
        type: category,
        category: category === 'hospital' ? 'Infrastructure' : category === 'station' ? 'Transport' : 'Public gathering',
        amenity: tags.amenity || category,
        lat: Number(latValue),
        lon: Number(lonValue),
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}

export async function geocodePlace(query) {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '5',
    addressdetails: '1',
  });

  const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
    headers: {
      'Accept-Language': 'en',
      'User-Agent': 'LocalThreatLens/1.0',
    },
  });

  if (!response.ok) {
    throw new Error('Location lookup failed');
  }

  const results = await response.json();
  return results.map((item) => ({
    name: item.display_name,
    lat: Number(item.lat),
    lon: Number(item.lon),
    address: item.address || {},
  }));
}

export async function buildRouteRisk(start, destination) {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(destination.lat - start.lat);
  const dLon = toRad(destination.lon - start.lon);
  const lat1 = toRad(start.lat);
  const lat2 = toRad(destination.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const distanceKm = 2 * R * Math.asin(Math.sqrt(h));

  const averageSpeedKmh = 28;
  const durationMinutes = clamp(Math.round((distanceKm / averageSpeedKmh) * 60), 3, 240);
  const riskBand = distanceKm > 12 ? 'Moderate route risk' : distanceKm > 6 ? 'Baseline caution' : 'Low route risk';

  return {
    start,
    destination,
    distanceKm: Number(distanceKm.toFixed(1)),
    durationMinutes,
    riskBand,
    safetyScore: clamp(Math.round(100 - (distanceKm * 2.8)), 35, 94),
    publicSignals: [
      { label: 'Weather', score: 62 },
      { label: 'Traffic', score: 58 },
      { label: 'Crowd density', score: 44 },
    ],
  };
}
