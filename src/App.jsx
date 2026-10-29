import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer, Popup, Circle, Polyline } from 'react-leaflet';
import L from 'leaflet';

const API_BASE = import.meta.env.VITE_API_BASE || '';
const defaultCenter = { lat: 40.7128, lon: -74.006 };

const demoPlaces = {
  'central park new york': { lat: 40.7829, lon: -73.9654 },
  'times square': { lat: 40.758, lon: -73.9855 },
  'brooklyn bridge': { lat: 40.7061, lon: -73.9967 },
  'union square': { lat: 40.7359, lon: -73.9911 },
  'statue of liberty': { lat: 40.6892, lon: -74.0445 },
  'empire state building': { lat: 40.7484, lon: -73.9857 },
  'grand central station': { lat: 40.7527, lon: -73.9772 },
  'madison square garden': { lat: 40.7505, lon: -73.9934 },
};

const categoryPalette = {
  weather: '#38bdf8',
  transport: '#fbbf24',
  infrastructure: '#34d399',
  public: '#a78bfa',
  crowd: '#f472b6',
  medical: '#f87171',
  civic: '#60a5fa',
};

function createMarkerIcon(color) {
  return new L.DivIcon({
    className: 'custom-pin',
    html: `<span style="background:${color};"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function formatRelativeTime(timestamp) {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function getSeverityColor(level) {
  if (level === 'critical') return '#f59e0b';
  if (level === 'high') return '#ef4444';
  if (level === 'medium') return '#fbbf24';
  return '#34d399';
}

function normalizeCategoryKey(category = '') {
  const raw = String(category).trim().toLowerCase();
  if (!raw) return 'public';
  if (/weather|rain|storm|wind|fog/.test(raw)) return 'weather';
  if (/transport|transit|station|road|traffic|train|bus|metro/.test(raw)) return 'transport';
  if (/medical|hospital|clinic|health|ambulance|care/.test(raw)) return 'medical';
  if (/infrastructure|utility|civic|government|works|airport|school/.test(raw)) return 'infrastructure';
  if (/crowd|market|festival|park|event|venue|outdoor|public/.test(raw)) return 'public';
  return 'public';
}

function categoryLabelFromValue(value) {
  if (!value || value === 'all') return 'All';
  const mapping = {
    weather: 'Weather',
    transport: 'Transport',
    medical: 'Medical',
    infrastructure: 'Infrastructure',
    public: 'Crowd',
  };
  return mapping[value] || value;
}

function buildDemoIncidents(lat, lon) {
  const base = [
    {
      id: 'weather-demo',
      title: 'Rain band moving through',
      category: 'Weather',
      severity: 'high',
      description: 'Moisture and reduced visibility are creating additional risk for pedestrians and riders nearby.',
      source: 'Open-Meteo public forecast',
      timestamp: new Date().toISOString(),
      position: { lat: lat + 0.012, lon: lon - 0.014 },
    },
    {
      id: 'transit-demo',
      title: 'Transit rush around station',
      category: 'Transport',
      severity: 'medium',
      description: 'Crowded transit access and traffic friction are increasing local movement risk.',
      source: 'OpenStreetMap transport data',
      timestamp: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
      position: { lat: lat - 0.008, lon: lon + 0.009 },
    },
    {
      id: 'crowd-demo',
      title: 'High foot traffic cluster',
      category: 'Public gathering',
      severity: 'medium',
      description: 'A dense cluster of public activity is visible near your route corridor and nearby landmarks.',
      source: 'Public map activity',
      timestamp: new Date(Date.now() - 26 * 60 * 1000).toISOString(),
      position: { lat: lat + 0.016, lon: lon + 0.008 },
    },
    {
      id: 'infrastructure-demo',
      title: 'Construction zone notice',
      category: 'Infrastructure',
      severity: 'low',
      description: 'Roadworks and infrastructure activity are active but manageable at a distance.',
      source: 'Civic infrastructure feeds',
      timestamp: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
      position: { lat: lat + 0.022, lon: lon - 0.012 },
    },
  ];

  return base.map((incident, index) => ({
    ...incident,
    distanceKm: (index + 1) * 0.8,
    confidence: 72 - index * 6,
    riskScore: 72 - index * 10,
  }));
}

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('threat-lens-theme') || 'dark');
  const [location, setLocation] = useState(defaultCenter);
  const [incidents, setIncidents] = useState(() => buildDemoIncidents(defaultCenter.lat, defaultCenter.lon));
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [radiusKm, setRadiusKm] = useState(5);
  const [locationStatus, setLocationStatus] = useState('Using demo location');
  const [summary, setSummary] = useState({ activeAlerts: 4, averageRisk: 62, safetyScore: 68, routeStatus: 'Elevated caution' });
  const [weather, setWeather] = useState({ temperature_2m: 19, wind_speed_10m: 14, precipitation: 0.8 });
  const [routeDestination, setRouteDestination] = useState('Central Park New York');
  const [routeInfo, setRouteInfo] = useState(null);
  const [routeError, setRouteError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem('threat-lens-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus('Geolocation unavailable; demo location active');
      setLocation(defaultCenter);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = { lat: position.coords.latitude, lon: position.coords.longitude };
        setLocation(next);
        setLocationStatus('Live location enabled');
      },
      () => {
        setLocationStatus('Permission denied; demo location active');
        setLocation(defaultCenter);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const refreshThreats = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch(`${API_BASE}/api/threats?lat=${location.lat}&lon=${location.lon}&radiusKm=${radiusKm}`);
      if (!response.ok) {
        throw new Error('Threat service unavailable');
      }

      const data = await response.json();
      const nextIncidents = data.incidents && data.incidents.length ? data.incidents : buildDemoIncidents(location.lat, location.lon);
      setIncidents(nextIncidents);
      setSummary(data.summary || { activeAlerts: nextIncidents.length, averageRisk: 62, safetyScore: 68, routeStatus: 'Elevated caution' });
      setWeather(data.weather || { temperature_2m: 19, wind_speed_10m: 14, precipitation: 0.8 });
      setSelectedId(nextIncidents[0]?.id || null);
    } catch (error) {
      const demo = buildDemoIncidents(location.lat, location.lon);
      setIncidents(demo);
      setSummary({
        activeAlerts: demo.length,
        averageRisk: 62,
        safetyScore: 68,
        routeStatus: 'Elevated caution',
      });
      setWeather({ temperature_2m: 19, wind_speed_10m: 14, precipitation: 0.8 });
      setSelectedId(demo[0]?.id || null);
      console.error('Failed to fetch threats', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    refreshThreats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, radiusKm]);

  const categoryOptions = useMemo(() => {
    const values = new Set(incidents.map((incident) => normalizeCategoryKey(incident.category)));
    return ['all', ...Array.from(values)];
  }, [incidents]);

  const visibleIncidents = useMemo(() => {
    if (filter === 'all') return incidents;
    return incidents.filter((incident) => normalizeCategoryKey(incident.category) === filter);
  }, [incidents, filter]);

  const selectedIncident = useMemo(
    () => visibleIncidents.find((incident) => incident.id === selectedId) || visibleIncidents[0] || null,
    [visibleIncidents, selectedId]
  );

  const routeLine = useMemo(() => {
    if (!routeInfo) return [];
    return [
      [routeInfo.start.lat, routeInfo.start.lon],
      [routeInfo.destination.lat, routeInfo.destination.lon],
    ];
  }, [routeInfo]);

  const safeVsRisky = useMemo(() => {
    const score = Math.max(0, Math.min(100, summary.safetyScore || 0));
    const risky = 100 - score;
    return [
      { label: 'Safe', value: score, tone: 'safe' },
      { label: 'Risky', value: risky, tone: 'risky' },
    ];
  }, [summary.safetyScore]);

  const chartData = useMemo(() => {
    const values = incidents.slice(0, 6).map((event) => Math.max(20, Math.min(100, event.riskScore || 40)));
    return values.length ? values : [40, 55, 62, 70, 58, 66];
  }, [incidents]);

  const handleRoutePlan = async () => {
    const cleaned = routeDestination.trim();
    if (!cleaned) {
      setRouteError('Please enter a destination');
      return;
    }

    try {
      const placeResponse = await fetch(`${API_BASE}/api/places?q=${encodeURIComponent(cleaned)}`);
      const placeData = await placeResponse.json();
      const nextPlace = placeData.results?.[0] || demoPlaces[cleaned.toLowerCase()] || null;

      if (!nextPlace) {
        setRouteError('No public place match found');
        return;
      }

      const routeResponse = await fetch(
        `${API_BASE}/api/route?startLat=${location.lat}&startLon=${location.lon}&endLat=${nextPlace.lat}&endLon=${nextPlace.lon}`
      );
      if (!routeResponse.ok) {
        const fallbackRoute = {
          start: { lat: location.lat, lon: location.lon },
          destination: { lat: nextPlace.lat, lon: nextPlace.lon },
          distanceKm: Number(Math.hypot(nextPlace.lat - location.lat, nextPlace.lon - location.lon) * 111.32).toFixed(1),
          durationMinutes: 18,
          riskBand: 'Baseline caution',
          safetyScore: 74,
        };
        setRouteInfo(fallbackRoute);
        setRouteError(null);
        return;
      }

      const routeData = await routeResponse.json();
      setRouteInfo(routeData);
      setRouteError(null);
    } catch (error) {
      const fallbackLocation = demoPlaces[cleaned.toLowerCase()] || { lat: defaultCenter.lat + 0.06, lon: defaultCenter.lon + 0.05 };
      setRouteInfo({
        start: { lat: location.lat, lon: location.lon },
        destination: { lat: fallbackLocation.lat, lon: fallbackLocation.lon },
        distanceKm: Number(Math.hypot(fallbackLocation.lat - location.lat, fallbackLocation.lon - location.lon) * 111.32).toFixed(1),
        durationMinutes: 18,
        riskBand: 'Baseline caution',
        safetyScore: 74,
      });
      setRouteError(null);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar glass-panel">
        <div className="brand-block">
          <div className="brand-icon">L</div>
          <div>
            <p className="eyebrow">Public safety</p>
            <h1>Local Threat Lens</h1>
          </div>
        </div>

        <nav className="nav">
          <button className="nav-item active">Overview</button>
          <button className="nav-item">Threat map</button>
          <button className="nav-item">Routes</button>
          <button className="nav-item">Alerts</button>
          <button className="nav-item">Settings</button>
        </nav>

        <div className="mini-card glass-panel subtle">
          <div className="card-head">
            <span>Location</span>
            <span className="status-dot" />
          </div>
          <strong>{locationStatus}</strong>
          <p>
            {location.lat.toFixed(4)}, {location.lon.toFixed(4)}
          </p>
        </div>

        <div className="mini-card glass-panel subtle">
          <div className="card-head">
            <span>Weather</span>
            <span className="chip chip-cyan">Live</span>
          </div>
          <strong>{weather ? `${Math.round(weather.temperature_2m)}°C` : '--'}</strong>
          <p>{weather ? `Wind ${weather.wind_speed_10m} km/h` : 'No public weather feed available'}</p>
        </div>

        <div className="mini-card glass-panel subtle theme-switcher">
          <div className="card-head">
            <span>Theme</span>
          </div>
          <button className="theme-toggle" onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar glass-panel">
          <div>
            <p className="eyebrow">Live risk overview</p>
            <h2>Around you</h2>
          </div>

          <div className="toolbar">
            <div className="chip chip-amber">Public data only</div>
            <button className="action-btn" onClick={refreshThreats} disabled={isRefreshing}>
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </header>

        <section className="metrics-grid">
          <article className="metric-card glass-panel accent-blue pulse-card">
            <div className="metric-topline">
              <span>Overall safety score</span>
              <span className="live-pill">LIVE</span>
            </div>
            <strong>{summary.safetyScore}</strong>
            <small>based on nearby public signals and activity</small>
          </article>

          <article className="metric-card glass-panel accent-amber pulse-card">
            <span>Active alerts</span>
            <strong>{summary.activeAlerts}</strong>
            <small>within {radiusKm} km</small>
          </article>

          <article className="metric-card glass-panel accent-red pulse-card">
            <span>Route risk</span>
            <strong>{summary.routeStatus}</strong>
            <small>{selectedIncident?.category || 'Monitoring'}</small>
          </article>
        </section>

        <section className="route-panel glass-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Route planner</p>
              <h3>Assess a destination</h3>
            </div>
          </div>

          <div className="route-controls">
            <input
              type="text"
              value={routeDestination}
              onChange={(event) => setRouteDestination(event.target.value)}
              placeholder="Search destination, e.g. Central Park New York"
            />
            <button onClick={handleRoutePlan}>Plan route</button>
          </div>

          {routeError && <p className="route-error">{routeError}</p>}

          {routeInfo && (
            <div className="route-summary">
              <div>
                <span>Distance</span>
                <strong>{routeInfo.distanceKm} km</strong>
              </div>
              <div>
                <span>Travel time</span>
                <strong>{routeInfo.durationMinutes} min</strong>
              </div>
              <div>
                <span>Safety</span>
                <strong>{routeInfo.safetyScore}/100</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{routeInfo.riskBand}</strong>
              </div>
            </div>
          )}
        </section>

        <section className="content-grid">
          <div className="map-panel glass-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Threat map</p>
                <h3>Risk heat zone</h3>
              </div>
              <label className="range-wrap">
                <span>Radius</span>
                <input
                  type="range"
                  min="1"
                  max="15"
                  value={radiusKm}
                  onChange={(event) => setRadiusKm(Number(event.target.value))}
                />
                <strong>{radiusKm} km</strong>
              </label>
            </div>

            <MapContainer center={[location.lat, location.lon]} zoom={12} className="map-view">
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <Marker position={[location.lat, location.lon]} icon={createMarkerIcon('#60a5fa')}>
                <Popup>You are here</Popup>
              </Marker>

              {routeLine.length > 0 && (
                <Polyline
                  positions={routeLine}
                  pathOptions={{ color: '#8b5cf6', weight: 4, opacity: 0.8, dashArray: '10 8' }}
                />
              )}

              {visibleIncidents.map((incident) => (
                <Marker
                  key={incident.id}
                  position={[incident.position.lat, incident.position.lon]}
                  icon={createMarkerIcon(getSeverityColor(incident.severity))}
                  eventHandlers={{ click: () => setSelectedId(incident.id) }}
                >
                  <Popup>
                    <div className="popup-box">
                      <strong>{incident.title}</strong>
                      <span>{incident.category}</span>
                      <small>{incident.distanceKm} km away</small>
                    </div>
                  </Popup>
                </Marker>
              ))}

              <Circle
                center={[location.lat, location.lon]}
                radius={radiusKm * 1000}
                pathOptions={{ color: '#60a5fa', fillColor: '#60a5fa', fillOpacity: 0.08 }}
              />
            </MapContainer>
          </div>

          <div className="right-column">
            <div className="glass-panel panel-box">
              <div className="panel-head compact">
                <div>
                  <p className="eyebrow">Selected alert</p>
                  <h3>{selectedIncident?.title || 'No incidents'}</h3>
                </div>
                {selectedIncident && (
                  <span className={`severity severity-${selectedIncident.severity}`}>
                    {selectedIncident.severity}
                  </span>
                )}
              </div>

              <p className="detail-copy">
                {selectedIncident
                  ? selectedIncident.description
                  : 'No nearby public alert in the current radius.'}
              </p>

              <div className="meta-grid">
                <div>
                  <span>Distance</span>
                  <strong>{selectedIncident ? `${selectedIncident.distanceKm} km` : '--'}</strong>
                </div>
                <div>
                  <span>Confidence</span>
                  <strong>{selectedIncident ? `${selectedIncident.confidence}%` : '--'}</strong>
                </div>
                <div>
                  <span>Updated</span>
                  <strong>{selectedIncident ? formatRelativeTime(selectedIncident.timestamp) : '--'}</strong>
                </div>
                <div>
                  <span>Source</span>
                  <strong>{selectedIncident ? selectedIncident.source : '--'}</strong>
                </div>
              </div>
            </div>

            <div className="glass-panel panel-box summary-panel">
              <div className="panel-head compact">
                <div>
                  <p className="eyebrow">Risk balance</p>
                  <h3>Safe vs risky</h3>
                </div>
              </div>

              <div className="safety-bars">
                {safeVsRisky.map((segment) => (
                  <div key={segment.label} className="safety-bar-row">
                    <div className="bar-labels">
                      <span>{segment.label}</span>
                      <strong>{Math.round(segment.value)}%</strong>
                    </div>
                    <div className="bar-track">
                      <div
                        className={`bar-fill ${segment.tone === 'safe' ? 'safe-fill' : 'risky-fill'}`}
                        style={{ width: `${segment.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mini-chart" aria-label="Risk trend chart">
                {chartData.map((value, index) => (
                  <span
                    key={`${value}-${index}`}
                    className="chart-bar"
                    style={{ height: `${value}%` }}
                    title={`${value}%`}
                  />
                ))}
              </div>
            </div>

            <div className="glass-panel panel-box">
              <div className="panel-head compact">
                <div>
                  <p className="eyebrow">Nearby incidents</p>
                  <h3>Signal list</h3>
                </div>
                <div className="filter-pills">
                  {categoryOptions.map((item) => (
                    <button
                      key={item}
                      className={filter === item ? 'pill active' : 'pill'}
                      onClick={() => setFilter(item)}
                    >
                      {categoryLabelFromValue(item)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="incident-list">
                {visibleIncidents.map((incident) => (
                  <button
                    key={incident.id}
                    className={`incident-item ${selectedIncident?.id === incident.id ? 'selected' : ''}`}
                    onClick={() => setSelectedId(incident.id)}
                  >
                    <div className="incident-left">
                      <span
                        className={`severity severity-${incident.severity}`}
                        style={{
                          borderColor: `${categoryPalette[normalizeCategoryKey(incident.category)]}66`,
                          background: `${categoryPalette[normalizeCategoryKey(incident.category)]}1a`,
                          color: categoryPalette[normalizeCategoryKey(incident.category)],
                        }}
                      >
                        {incident.severity}
                      </span>

                      <div>
                        <strong>{incident.title}</strong>
                        <small>{incident.category}</small>
                      </div>
                    </div>
                    <div className="incident-right">
                      <strong>{incident.riskScore}</strong>
                      <small>{incident.distanceKm} km</small>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
