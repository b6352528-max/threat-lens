import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';

const API_BASE = 'http://localhost:4000';
const defaultCenter = { lat: 40.7128, lon: -74.006 };

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

function App() {
  const [location, setLocation] = useState(defaultCenter);
  const [incidents, setIncidents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [radiusKm, setRadiusKm] = useState(5);
  const [locationStatus, setLocationStatus] = useState('Using demo location');
  const [summary, setSummary] = useState({ activeAlerts: 0, averageRisk: 0, safetyScore: 100, routeStatus: 'Normal watch' });
  const [weather, setWeather] = useState(null);
  const [routeDestination, setRouteDestination] = useState('Central Park New York');
  const [routeInfo, setRouteInfo] = useState(null);
  const [routeError, setRouteError] = useState(null);

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

  useEffect(() => {
    const fetchThreats = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/threats?lat=${location.lat}&lon=${location.lon}&radiusKm=${radiusKm}`);
        const data = await response.json();
        setIncidents(data.incidents || []);
        setSummary(data.summary || { activeAlerts: 0, averageRisk: 0, safetyScore: 100, routeStatus: 'Normal watch' });
        setWeather(data.weather || null);
        setSelectedId((data.incidents || [])[0]?.id || null);
      } catch (error) {
        console.error('Failed to fetch threats', error);
      }
    };

    fetchThreats();
  }, [location, radiusKm]);

  const visibleIncidents = useMemo(() => {
    if (filter === 'all') return incidents;
    return incidents.filter((incident) => incident.category.toLowerCase() === filter);
  }, [incidents, filter]);

  const selectedIncident = useMemo(
    () => visibleIncidents.find((incident) => incident.id === selectedId) || visibleIncidents[0] || null,
    [visibleIncidents, selectedId]
  );

  const handleRoutePlan = async () => {
    try {
      const placeResponse = await fetch(`${API_BASE}/api/places?q=${encodeURIComponent(routeDestination)}`);
      const placeData = await placeResponse.json();
      const nextPlace = placeData.results?.[0];

      if (!nextPlace) {
        setRouteError('No public place match found');
        return;
      }

      const routeResponse = await fetch(
        `${API_BASE}/api/route?startLat=${location.lat}&startLon=${location.lon}&endLat=${nextPlace.lat}&endLon=${nextPlace.lon}`
      );
      const routeData = await routeResponse.json();
      setRouteInfo(routeData);
      setRouteError(null);
    } catch (error) {
      setRouteError('Route planning is unavailable right now');
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
          <p>{location.lat.toFixed(4)}, {location.lon.toFixed(4)}</p>
        </div>

        <div className="mini-card glass-panel subtle">
          <div className="card-head">
            <span>Weather</span>
            <span className="chip chip-cyan">Live</span>
          </div>
          <strong>{weather ? `${Math.round(weather.temperature_2m)}°C` : '--'}</strong>
          <p>{weather ? `Wind ${weather.wind_speed_10m} km/h` : 'No public weather feed available'}</p>
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
            <button className="action-btn">Refresh</button>
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

            <div className="glass-panel panel-box">
              <div className="panel-head compact">
                <div>
                  <p className="eyebrow">Nearby incidents</p>
                  <h3>Signal list</h3>
                </div>
                <div className="filter-pills">
                  {['all', 'weather', 'transport', 'infrastructure', 'public gathering'].map((item) => (
                    <button
                      key={item}
                      className={filter === item ? 'pill active' : 'pill'}
                      onClick={() => setFilter(item)}
                    >
                      {item === 'all' ? 'All' : item}
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
                      <span className={`severity severity-${incident.severity}`}>{incident.severity}</span>
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
