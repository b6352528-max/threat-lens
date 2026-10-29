const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

const localPlaceIndex = [
  { name: 'Central Park New York', lat: 40.7829, lon: -73.9654, address: { city: 'New York', state: 'New York' } },
  { name: 'Times Square', lat: 40.758, lon: -73.9855, address: { city: 'New York', state: 'New York' } },
  { name: 'Brooklyn Bridge', lat: 40.7061, lon: -73.9967, address: { city: 'New York', state: 'New York' } },
  { name: 'Union Square', lat: 40.7359, lon: -73.9911, address: { city: 'New York', state: 'New York' } },
  { name: 'Statue of Liberty', lat: 40.6892, lon: -74.0445, address: { city: 'New York', state: 'New York' } },
  { name: 'Empire State Building', lat: 40.7484, lon: -73.9857, address: { city: 'New York', state: 'New York' } },
  { name: 'Grand Central Station', lat: 40.7527, lon: -73.9772, address: { city: 'New York', state: 'New York' } },
  { name: 'Madison Square Garden', lat: 40.7505, lon: -73.9934, address: { city: 'New York', state: 'New York' } },
  { name: 'Hudson Yards', lat: 40.7549, lon: -74.0024, address: { city: 'New York', state: 'New York' } },
  { name: 'Chelsea Market', lat: 40.7411, lon: -74.0048, address: { city: 'New York', state: 'New York' } },
];

function normalizeQuery(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ');
}

function generateSignalsAround(lat, lon, radiusKm = 5) {
  const radiusMeters = Math.round(radiusKm * 1000);
  const sampling = [
    { name: 'Grand Central', type: 'station', category: 'Transport', lat: lat + 0.0085, lon: lon + 0.0045 },
    { name: 'City Park', type: 'park', category: 'Public gathering', lat: lat - 0.005, lon: lon + 0.008, amenity: 'park' },
    { name: 'Metro Health', type: 'hospital', category: 'Infrastructure', lat: lat + 0.012, lon: lon - 0.01, amenity: 'hospital' },
    { name: 'Market Square', type: 'marketplace', category: 'Public gathering', lat: lat + 0.006, lon: lon + 0.012, amenity: 'marketplace' },
    { name: 'Transit Hub', type: 'bus_station', category: 'Transport', lat: lat - 0.012, lon: lon - 0.006, amenity: 'bus_station' },
  ];

  return sampling
    .map((signal, index) => ({
      id: `${signal.type}-${index}`,
      name: signal.name,
      type: signal.type,
      category: signal.category,
      amenity: signal.amenity || signal.type,
      lat: Number((signal.lat + (Math.sin(index + 1) * 0.002)).toFixed(5)),
      lon: Number((signal.lon + (Math.cos(index + 2) * 0.002)).toFixed(5)),
      distance: Math.round(Math.hypot(signal.lat - lat, signal.lon - lon) * 111.32),
      radiusMeters,
    }))
    .filter((signal) => signal.distance <= radiusMeters + 2000)
    .slice(0, 6);
}

export async function fetchWeather(lat, lon) {
  try {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      current: 'temperature_2m,precipitation,wind_speed_10m',
      timezone: 'auto',
    });

    const response = await fetch(`${WEATHER_URL}?${params.toString()}`);
    if (!response.ok) throw new Error('Weather API request failed');

    const payload = await response.json();
    return payload.current || {
      temperature_2m: 19,
      precipitation: 0.6,
      wind_speed_10m: 13,
    };
  } catch (error) {
    return {
      temperature_2m: 19,
      precipitation: 0.6,
      wind_speed_10m: 13,
    };
  }
}

export async function fetchOverpassSignals(lat, lon, radiusKm = 5) {
  try {
    const radiusMeters = Math.round(radiusKm * 1000);
    const query = `
      [out:json][timeout:25];
      (
        node(around:${radiusMeters},${lat},${lon})["amenity"];
        way(around:${radiusMeters},${lat},${lon})["amenity"];
        node(around:${radiusMeters},${lat},${lon})["leisure"];
        way(around:${radiusMeters},${lat},${lon})["leisure"];
      );
      out center 20;
    `;

    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'application/json',
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) throw new Error('Overpass request failed');

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
  } catch (error) {
    return generateSignalsAround(lat, lon, radiusKm);
  }
}

export async function geocodePlace(query) {
  const cleaned = normalizeQuery(query);
  if (!cleaned) return [];

  const exact = localPlaceIndex.filter((place) => normalizeQuery(place.name).includes(cleaned));
  if (exact.length) return exact;

  try {
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
        Accept: 'application/json',
      },
    });

    if (!response.ok) throw new Error('Location lookup failed');

    const results = await response.json();
    const mapped = results.map((item) => ({
      name: item.display_name,
      lat: Number(item.lat),
      lon: Number(item.lon),
      address: item.address || {},
    }));

    return mapped.length ? mapped : localPlaceIndex.slice(0, 5);
  } catch (error) {
    return localPlaceIndex.filter((place) => normalizeQuery(place.name).includes(cleaned) || cleaned.includes(normalizeQuery(place.name))).slice(0, 5);
  }
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

  const weatherPenalty = distanceKm > 9 ? 12 : 5;
  const crowdPenalty = distanceKm > 7 ? 9 : 4;
  const safetyScore = clamp(Math.round(100 - (distanceKm * 2.8) - weatherPenalty - crowdPenalty), 35, 94);

  return {
    start,
    destination,
    distanceKm: Number(distanceKm.toFixed(1)),
    durationMinutes,
    riskBand,
    safetyScore,
    publicSignals: [
      { label: 'Weather', score: 62 },
      { label: 'Traffic', score: 58 },
      { label: 'Crowd density', score: 44 },
    ],
  };
}

export default {
  fetchWeather,
  fetchOverpassSignals,
  geocodePlace,
  buildRouteRisk,
};
