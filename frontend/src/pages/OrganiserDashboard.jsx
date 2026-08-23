import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function OrganiserDashboard() {
  const [venues, setVenues] = useState([]);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [creating, setCreating] = useState(false);
  const [summaries, setSummaries] = useState({});
  const [expandedId, setExpandedId] = useState(null);

  const [form, setForm] = useState({
    venueId: '',
    title: '',
    description: '',
    type: 'movie',
    eventDate: '',
    eventTime: '',
    pricing: {},
  });

  async function loadVenues() {
    try {
      const { venues } = await api.listVenues();
      setVenues(venues);
      if (venues.length > 0 && !form.venueId) {
        setForm((f) => ({ ...f, venueId: venues[0].id }));
        loadVenueCategories(venues[0].id);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadVenueCategories(venueId) {
    if (!venueId) return;
    const { seats } = await api.getVenue(venueId);
    const categories = [...new Set(seats.map((s) => s.category))];
    setForm((f) => ({
      ...f,
      venueId,
      pricing: Object.fromEntries(categories.map((c) => [c, f.pricing[c] || ''])),
    }));
  }

  async function loadEvents() {
    try {
      const { events } = await api.listEvents();
      setEvents(events);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadVenues();
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setCreating(true);
    try {
      const pricingPayload = Object.fromEntries(
        Object.entries(form.pricing).map(([k, v]) => [k, Number(v)])
      );
      await api.createEvent({
        venueId: form.venueId,
        title: form.title,
        description: form.description,
        type: form.type,
        eventDate: form.eventDate,
        eventTime: form.eventTime,
        pricing: pricingPayload,
      });
      setSuccess(`"${form.title}" was published.`);
      setForm((f) => ({ ...f, title: '', description: '', eventDate: '', eventTime: '' }));
      loadEvents();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function toggleSummary(eventId) {
    if (expandedId === eventId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(eventId);
    if (!summaries[eventId]) {
      try {
        const data = await api.getEventSummary(eventId);
        setSummaries((s) => ({ ...s, [eventId]: data }));
      } catch (err) {
        setError(err.message);
      }
    }
  }

  return (
    <div>
      <h1 className="page-title">Organiser Dashboard</h1>
      <p className="page-subtitle">Create event listings and track revenue.</p>

      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      <div className="card" style={{ marginBottom: 32 }}>
        <h3 style={{ marginTop: 0, fontFamily: 'var(--font-display)', fontSize: 22 }}>New Event Listing</h3>
        {venues.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No venues exist yet — ask an admin to create one first.</p>
        ) : (
          <form onSubmit={handleCreate}>
            <div className="form-field">
              <label>Venue</label>
              <select
                value={form.venueId}
                onChange={(e) => loadVenueCategories(e.target.value)}
              >
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Title</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div className="form-field">
              <label>Description</label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="form-field" style={{ flex: 1 }}>
                <label>Type</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="movie">Movie</option>
                  <option value="concert">Concert</option>
                </select>
              </div>
              <div className="form-field" style={{ flex: 1 }}>
                <label>Date</label>
                <input
                  type="date"
                  value={form.eventDate}
                  onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
                  required
                />
              </div>
              <div className="form-field" style={{ flex: 1 }}>
                <label>Time</label>
                <input
                  type="time"
                  value={form.eventTime}
                  onChange={(e) => setForm({ ...form, eventTime: e.target.value })}
                  required
                />
              </div>
            </div>

            {Object.keys(form.pricing).length > 0 && (
              <div className="form-field">
                <label>Pricing per category</label>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {Object.keys(form.pricing).map((cat) => (
                    <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-muted)', minWidth: 70 }}>{cat}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        style={{ width: 90 }}
                        value={form.pricing[cat]}
                        onChange={(e) =>
                          setForm({ ...form, pricing: { ...form.pricing, [cat]: e.target.value } })
                        }
                        required
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button className="btn btn-primary" disabled={creating}>
              {creating ? 'Publishing…' : 'Publish event'}
            </button>
          </form>
        )}
      </div>

      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>Your Events</h3>
      {events.map((ev) => (
        <div key={ev.id} className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700 }}>{ev.title}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                {ev.event_date} · {ev.event_time} · {ev.venue_name}
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => toggleSummary(ev.id)}>
              {expandedId === ev.id ? 'Hide summary' : 'View summary'}
            </button>
          </div>

          {expandedId === ev.id && summaries[ev.id] && (
            <div style={{ marginTop: 16, borderTop: '1px solid var(--border-soft)', paddingTop: 16 }}>
              <div className="stat-grid">
                <div className="stat-card">
                  <div className="stat-value">${summaries[ev.id].totalRevenue.toFixed(2)}</div>
                  <div className="stat-label">Revenue</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{summaries[ev.id].totalBookings}</div>
                  <div className="stat-label">Bookings</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{summaries[ev.id].totalSeatsSold}</div>
                  <div className="stat-label">Seats sold</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{summaries[ev.id].waitlistCount}</div>
                  <div className="stat-label">Waitlisted</div>
                </div>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries[ev.id].seatCounts.map((sc, i) => (
                    <tr key={i}>
                      <td>{sc.category}</td>
                      <td>{sc.status}</td>
                      <td>{sc.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
