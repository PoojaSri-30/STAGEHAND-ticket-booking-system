import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

export default function EventsList() {
  const [events, setEvents] = useState(null);
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const params = {};
      if (type) params.type = type;
      if (q) params.q = q;
      const { events } = await api.listEvents(params);
      setEvents(events);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  function handleSearch(e) {
    e.preventDefault();
    load();
  }

  return (
    <div>
      <h1 className="page-title">Now Booking</h1>
      <p className="page-subtitle">Browse movies and concerts, then pick your seats from a live seat map.</p>

      <form className="filter-bar" onSubmit={handleSearch}>
        <input
          placeholder="Search by title…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          <option value="movie">Movies</option>
          <option value="concert">Concerts</option>
        </select>
        <button className="btn btn-ghost">Search</button>
      </form>

      {error && <div className="error-banner">{error}</div>}

      {!events && (
        <div className="center-loading">
          <div className="spinner" />
        </div>
      )}

      {events && events.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-title">No events found</div>
          <p>Try a different search or check back soon.</p>
        </div>
      )}

      <div className="event-grid">
        {events &&
          events.map((ev) => (
            <Link key={ev.id} to={`/events/${ev.id}`} className="event-card">
              <div className="event-card-marquee" />
              <div className="event-card-body">
                <span className="event-type-tag">{ev.type}</span>
                <h3 className="event-card-title">{ev.title}</h3>
                <div className="event-card-meta">
                  <span>{ev.event_date} · {ev.event_time}</span>
                  <span>{ev.venue_name}</span>
                </div>
              </div>
            </Link>
          ))}
      </div>
    </div>
  );
}
