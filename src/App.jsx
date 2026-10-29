import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';

const API_BASE = 'http://localhost:4000';
const defaultCenter = { lat: 40.7128, lon: -74.006 };

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'map', label: 'Threat map' },
  { id: 'routes', label: 'Routes' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'settings', label: 'Settings' },
];

const signalTaxonomy = [
  { key: 'weather', label: 'Weather', accent: '#67e8f9' },
  { key: 'transport', label: 'Transit', accent: '#7dd3fc' },
  { key: 'infrastructure', label: 'Infrastructure', accent: '#c4b5fd' },
  { key: 'public gathering', label: 'Crowd', accent: '#f9a8d4' },
  { key: 'hazard', label: 'Hazards', accent: '#fbbf24' },
  { key: 'utility', label: 'Utilities', accent: '#34d399' },
];

function createMarkerIcon(color) {
  return new L.DivIcon({
    className: 'custom-pin',
    html: `<span style="background:${color}; box-shadow: 0 0 0 6px rgba(15, 23, 42, 0.18), 0 0 18px ${color};"></span>`,
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
  if (level === 'critical') return '#fb923c';
  if (level === 'high') return '#f87171';
  if (level === 'medium') return '#fbbf24';
  return '#34d399';
}

function getCategoryMeta(category = '') {
  const normalized = String(category).toLowerCase();
  const map = {
    weather: { label: 'Weather', color: '#67e8f9' },
    transport: { label: 'Transit', color: '#7dd3fc' },
    infrastructure: { label: 'Infrastructure', color: '#c4b5fd' },
    public: { label: 'Public gathering', color: '#f9a8d4' },
    gathering: { label: 'Crowd traffic', color: '#f9a8d4' },
    hazard: { label: 'Hazard', color: '#fbbf24' },
    utility: { label: 'Utility risk', color: '#34d399' },
  };

  return map[normalized] || { label: category || 'Signal', color: '#7dd3fc' };
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
  const [activeView, setActiveView] = useState('overview');

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

  const signalInventory = useMemo(() => {
    const counts = new Map();
    incidents.forEach((incident) => {
      const key = String(incident.category || 'general').toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return signalTaxonomy.map((group) => ({
      ...group,
      count: counts.get(group.key) || 0,
    }));
  }, [incidents]);

  const intelligenceSummary = useMemo(() => {
    if (!selectedIncident) {
      return 'No active anomalies are breaking the current watch window. Monitoring remains clear and route travel is stable.';
    }

    const meta = getCategoryMeta(selectedIncident.category);
    const weatherCue = weather && weather.precipitation > 0.5 ? 'Weather is amplifying the zone risk.' : 'Conditions remain within a manageable operating band.';
    return `${meta.label} signal is dominant near your location. ${selectedIncident.title} is rising with ${selectedIncident.confidence}% confidence. ${weatherCue}`;
  }, [selectedIncident, weather]);

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

  const renderOverview = () => (
    <>
      <section className="metrics-grid">
        <article className="metric-card glass-panel accent-blue pulse-card metric-focus">
          <div className="metric-topline">
            <span>Safety score</span>
            <span className="live-pill">LIVE</span>
          </div>
          <strong>{summary.safetyScore}</strong>
          <small>Estimated exposure in the current watch radius</small>
        </article>

        <article className="metric-card glass-panel accent-amber pulse-card">
          <span>Threat count</span>
          <strong>{summary.activeAlerts}</strong>
          <small>Signals within {radiusKm} km</small>
        </article>

        <article className="metric-card glass-panel accent-red pulse-card">
          <span>Route posture</span>
          <strong>{summary.routeStatus}</strong>
          <small>{selectedIncident?.category || 'Monitoring'}</small>
        </article>

        <article className="metric-card glass-panel accent-cyan pulse-card">
          <span>Weather pressure</span>
          <strong>{weather ? `${Math.round(weather.precipitation)} mm` : '0 mm'}</strong>
          <small>{weather ? `Wind ${weather.wind_speed_10m} km/h` : 'Awaiting feed'}</small>
        </article>
      </section>

      <section className="route-panel glass-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Destination risk</p>
            <h3>Route exposure model</h3>
          </div>
          <div className="status-badge badge-quiet">Intel preview</div>
        </div>

        <div className="route-controls">
          <input
            type="text"
            value={routeDestination}
            onChange={(event) => setRouteDestination(event.target.value)}
            placeholder="Search destination, e.g. Central Park New York"
          />
          <button onClick={handleRoutePlan}>Assess</button>
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
          <div className="glass-panel panel-box intel-panel">
            <div className="panel-head compact">
              <div>
                <p className="eyebrow">System insight</p>
                <h3>{selectedIncident?.title || 'No incidents'}</h3>
              </div>
              {selectedIncident && (
                <span className={`severity severity-${selectedIncident.severity}`}>
                  {selectedIncident.severity}
                </span>
              )}
            </div>

            <p className="intel-summary">{intelligenceSummary}</p>

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
                <h3>Signal feed</h3>
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
              {visibleIncidents.map((incident) => {
                const meta = getCategoryMeta(incident.category);
                return (
                  <button
                    key={incident.id}
                    className={`incident-item ${selectedIncident?.id === incident.id ? 'selected' : ''}`}
                    onClick={() => setSelectedId(incident.id)}
                  >
                    <div className="incident-left">
                      <span className="signal-dot" style={{ background: meta.color }} />
                      <div>
                        <strong>{incident.title}</strong>
                        <small>{meta.label}</small>
                      </div>
                    </div>
                    <div className="incident-right">
                      <strong>{incident.riskScore}</strong>
                      <small>{incident.distanceKm} km</small>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </>
  );

  const renderMapView = () => (
    <section className="single-panel-layout">
      <div className="map-panel glass-panel large-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Threat map</p>
            <h3>Live risk overlay</h3>
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

        <MapContainer center={[location.lat, location.lon]} zoom={12} className="map-view large-map">
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
    </section>
  );

  const renderRoutes = () => (
    <section className="route-scene">
      <div className="route-panel glass-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Destination risk</p>
            <h3>Route exposure model</h3>
          </div>
          <div className="status-badge badge-live">Active</div>
        </div>

        <div className="route-controls">
          <input
            type="text"
            value={routeDestination}
            onChange={(event) => setRouteDestination(event.target.value)}
            placeholder="Search destination"
          />
          <button onClick={handleRoutePlan}>Assess</button>
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
      </div>

      <div className="insight-grid">
        <div className="glass-panel panel-box">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">Risk briefing</p>
              <h3>Exposure summary</h3>
            </div>
          </div>
          <div className="mini-stat-row">
            <div className="mini-stat">
              <span>Base risk</span>
              <strong>{routeInfo ? routeInfo.riskBand : 'Low route risk'}</strong>
            </div>
            <div className="mini-stat">
              <span>Weather</span>
              <strong>{weather ? `${Math.round(weather.precipitation)} mm` : '0 mm'}</strong>
            </div>
          </div>
        </div>

        <div className="glass-panel panel-box intel-panel">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">Guidance</p>
              <h3>Recommended route posture</h3>
            </div>
          </div>
          <p className="intel-summary">
            {routeInfo
              ? `Current conditions favor a ${routeInfo.riskBand.toLowerCase()} route. Keep to illuminated corridors and avoid all high-density public choke points.`
              : 'No route evaluation loaded yet. Select a destination to map risk exposure.'}
          </p>
        </div>
      </div>
    </section>
  );

  const renderAlerts = () => (
    <section className="alert-scene content-grid">
      <div className="glass-panel panel-box">
        <div className="panel-head compact">
          <div>
            <p className="eyebrow">Incident stream</p>
            <h3>Threat feed</h3>
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
                <span className="signal-dot" style={{ background: getCategoryMeta(incident.category).color }} />
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

      <div className="glass-panel panel-box intel-panel">
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
        <p className="intel-summary">{selectedIncident ? selectedIncident.description : 'No nearby alert is active in the current watch zone.'}</p>

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
    </section>
  );

  const renderSettings = () => (
    <section className="settings-panel glass-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Preferences</p>
          <h3>Operational settings</h3>
        </div>
      </div>

      <div className="settings-grid">
        <div className="setting-card">
          <span>Watch radius</span>
          <strong>{radiusKm} km</strong>
          <input
            type="range"
            min="1"
            max="15"
            value={radiusKm}
            onChange={(event) => setRadiusKm(Number(event.target.value))}
          />
        </div>

        <div className="setting-card">
          <span>Location mode</span>
          <strong>{locationStatus}</strong>
          <small>Geolocation and fallback logic are enabled.</small>
        </div>

        <div className="setting-card">
          <span>Signal sources</span>
          <strong>Public + local fallback</strong>
          <small>Weather, map data, and route data remain resilliant offline.</small>
        </div>

        <div className="setting-card">
          <span>Alert posture</span>
          <strong>{summary.routeStatus}</strong>
          <small>Current operational watch state.</small>
        </div>
      </div>
    </section>
  );

  const renderCurrentView = () => {
    if (activeView === 'map') return renderMapView();
    if (activeView === 'routes') return renderRoutes();
    if (activeView === 'alerts') return renderAlerts();
    if (activeView === 'settings') return renderSettings();
    return renderOverview();
  };

  return (
    <div className="app-shell">
      <aside className="sidebar glass-panel">
        <div className="brand-block">
          <div className="brand-icon">L</div>
          <div>
            <p className="eyebrow">Public safety</p>
            <h1>Threat Lens</h1>
          </div>
        </div>

        <nav className="nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={activeView === item.id ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mini-card glass-panel subtle">
          <div className="card-head">
            <span>Position</span>
            <span className="status-dot" />
          </div>
          <strong>{locationStatus}</strong>
          <p>{location.lat.toFixed(4)}, {location.lon.toFixed(4)}</p>
        </div>

        <div className="mini-card glass-panel subtle">
          <div className="card-head">
            <span>Atmosphere</span>
            <span className="chip chip-cyan">Live</span>
          </div>
          <strong>{weather ? `${Math.round(weather.temperature_2m)}°C` : '--'}</strong>
          <p>{weather ? `Wind ${weather.wind_speed_10m} km/h • ${weather.precipitation} mm` : 'No public weather feed available'}</p>
        </div>

        <div className="mini-card taxonomy-card glass-panel subtle">
          <div className="card-head">
            <span>Signal taxonomy</span>
            <span className="chip chip-amber">{incidents.length}</span>
          </div>
          <div className="taxonomy-grid">
            {signalInventory.map((item) => (
              <div key={item.key} className="taxonomy-pill" style={{ '--pill-accent': item.accent }}>
                <span>{item.label}</span>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar glass-panel">
          <div className="topbar-intro">
            <p className="eyebrow">Live mission status</p>
            <h2>{NAV_ITEMS.find((item) => item.id === activeView)?.label || 'Overview'}</h2>
          </div>

          <div className="toolbar">
            <span className="status-badge badge-signal">Public data</span>
            <span className="status-badge badge-live">AI-assisted</span>
            <button className="action-btn" onClick={() => setActiveView('overview')}>Refresh</button>
          </div>
        </header>

        {renderCurrentView()}
      </main>
    </div>
  );
}

export default App;
