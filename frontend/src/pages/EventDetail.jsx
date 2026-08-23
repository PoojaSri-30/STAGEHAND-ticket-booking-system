import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, API_URL } from '../api/client';
import { useAuth } from '../context/AuthContext';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:4000/ws';

function groupByRow(seats) {
  const rows = {};
  for (const s of seats) {
    rows[s.row_label] = rows[s.row_label] || [];
    rows[s.row_label].push(s);
  }
  return Object.entries(rows).sort(([a], [b]) => a.localeCompare(b));
}

function formatCountdown(ms) {
  if (ms <= 0) return '0:00';
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function EventDetail() {
  const { id: eventId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  const [pricing, setPricing] = useState([]);
  const [seats, setSeats] = useState(null);
  const [selected, setSelected] = useState([]);
  const [hold, setHold] = useState(null); // { holdId, expiresAt }
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [waitlistBusy, setWaitlistBusy] = useState(null);
  const [waitlistMsg, setWaitlistMsg] = useState('');
  const wsRef = useRef(null);

  const priceMap = useMemo(() => Object.fromEntries(pricing.map((p) => [p.category, p.price])), [pricing]);

  const loadSeats = useCallback(async () => {
    try {
      const { seats } = await api.getSeats(eventId);
      setSeats(seats);
    } catch (err) {
      setError(err.message);
    }
  }, [eventId]);

  useEffect(() => {
    (async () => {
      try {
        const { event, pricing } = await api.getEvent(eventId);
        setEvent(event);
        setPricing(pricing);
      } catch (err) {
        setError(err.message);
      }
    })();
    loadSeats();
  }, [eventId, loadSeats]);

  // Real-time seat map updates over WebSocket
  useEffect(() => {
    let ws;
    try {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => ws.send(JSON.stringify({ subscribe: eventId }));
      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data.type === 'seat_update') loadSeats();
        } catch (e) {
          /* ignore */
        }
      };
      wsRef.current = ws;
    } catch (e) {
      /* WS optional - polling fallback below still works */
    }
    const poll = setInterval(loadSeats, 8000);
    return () => {
      clearInterval(poll);
      if (ws) ws.close();
    };
  }, [eventId, loadSeats]);

  // Countdown ticker
  useEffect(() => {
    if (!hold) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [hold]);

  const remainingMs = hold ? new Date(hold.expiresAt).getTime() - now : 0;

  useEffect(() => {
    if (hold && remainingMs <= 0) {
      setHold(null);
      setSelected([]);
      setError('Your seat hold expired and was released. Please select seats again.');
      loadSeats();
    }
  }, [remainingMs, hold, loadSeats]);

  function toggleSeat(seat) {
    if (hold) return; // locked once holding
    if (seat.status !== 'available') return;
    setSelected((prev) =>
      prev.includes(seat.id) ? prev.filter((id) => id !== seat.id) : [...prev, seat.id]
    );
  }

  async function handleHold() {
    if (!user) return navigate('/login');
    if (selected.length === 0) return;
    setError('');
    setBusy(true);
    try {
      const { holdId, expiresAt } = await api.holdSeats({ eventId, seatIds: selected });
      setHold({ holdId, expiresAt });
      loadSeats();
    } catch (err) {
      setError(err.message);
      loadSeats();
    } finally {
      setBusy(false);
    }
  }

  async function handleReleaseHold() {
    if (!hold) return;
    setBusy(true);
    try {
      await api.releaseHold(hold.holdId);
    } catch (e) {
      /* best-effort */
    }
    setHold(null);
    setSelected([]);
    setBusy(false);
    loadSeats();
  }

  async function handleConfirm() {
    if (!hold) return;
    setBusy(true);
    setError('');
    try {
      const { booking } = await api.confirmBooking(hold.holdId);
      navigate(`/booking-confirmed/${booking.id}`);
    } catch (err) {
      setError(err.message);
      setHold(null);
      setSelected([]);
      loadSeats();
    } finally {
      setBusy(false);
    }
  }

  async function handleJoinWaitlist(category) {
    if (!user) return navigate('/login');
    setWaitlistBusy(category);
    setWaitlistMsg('');
    try {
      await api.joinWaitlist({ eventId, category, quantity: 1 });
      setWaitlistMsg(`You're on the waitlist for ${category}. We'll email you if a seat opens up.`);
    } catch (err) {
      setWaitlistMsg(err.message);
    } finally {
      setWaitlistBusy(null);
    }
  }

  if (error && !event) return <div className="error-banner">{error}</div>;
  if (!event || !seats) {
    return (
      <div className="center-loading">
        <div className="spinner" />
      </div>
    );
  }

  const rows = groupByRow(seats);
  const categoryAvailability = {};
  for (const s of seats) {
    categoryAvailability[s.category] = categoryAvailability[s.category] || { available: 0, total: 0 };
    categoryAvailability[s.category].total += 1;
    if (s.status === 'available') categoryAvailability[s.category].available += 1;
  }

  const total = selected.reduce((sum, seatId) => {
    const seat = seats.find((s) => s.id === seatId);
    return sum + (seat ? priceMap[seat.category] || 0 : 0);
  }, 0);

  return (
    <div>
      <span className="event-type-tag">{event.type}</span>
      <h1 className="page-title">{event.title}</h1>
      <p className="page-subtitle">
        {event.event_date} · {event.event_time} · {event.venue_name}
        {event.venue_address ? ` — ${event.venue_address}` : ''}
      </p>

      {error && <div className="error-banner">{error}</div>}
      {waitlistMsg && <div className="success-banner">{waitlistMsg}</div>}

      <div className="screen-arc" />

      <div className="seat-map">
        {rows.map(([rowLabel, rowSeats]) => (
          <div className="seat-row" key={rowLabel}>
            <span className="seat-row-label">{rowLabel}</span>
            {rowSeats
              .sort((a, b) => a.seat_number - b.seat_number)
              .map((seat) => {
                const isSelected = selected.includes(seat.id);
                const cls = [
                  'seat',
                  `category-${seat.category.toLowerCase()}`,
                  isSelected ? 'selected' : seat.status,
                ].join(' ');
                return (
                  <button
                    key={seat.id}
                    className={cls}
                    title={`${rowLabel}${seat.seat_number} · ${seat.category} · $${priceMap[seat.category] ?? '–'}`}
                    onClick={() => toggleSeat(seat)}
                    disabled={seat.status !== 'available' && !isSelected}
                  >
                    {seat.seat_number}
                  </button>
                );
              })}
          </div>
        ))}
      </div>

      <div className="seat-legend">
        <div className="seat-legend-item">
          <span className="seat-legend-swatch" style={{ background: 'var(--surface-raised)' }} />
          Available
        </div>
        <div className="seat-legend-item">
          <span className="seat-legend-swatch" style={{ background: 'var(--gold)' }} />
          Your selection
        </div>
        <div className="seat-legend-item">
          <span className="seat-legend-swatch" style={{ background: 'var(--surface)', opacity: 0.5 }} />
          Held by another customer
        </div>
        <div className="seat-legend-item">
          <span className="seat-legend-swatch" style={{ background: 'var(--velvet)' }} />
          Booked
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0, fontFamily: 'var(--font-display)', fontSize: 20 }}>Pricing & Availability</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Price</th>
              <th>Available</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pricing.map((p) => {
              const avail = categoryAvailability[p.category] || { available: 0, total: 0 };
              const soldOut = avail.available === 0;
              return (
                <tr key={p.category}>
                  <td>{p.category}</td>
                  <td>${p.price.toFixed(2)}</td>
                  <td>
                    {soldOut ? (
                      <span style={{ color: 'var(--velvet-hover)' }}>Sold out</span>
                    ) : (
                      `${avail.available} / ${avail.total}`
                    )}
                  </td>
                  <td>
                    {soldOut && (
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={waitlistBusy === p.category}
                        onClick={() => handleJoinWaitlist(p.category)}
                      >
                        {waitlistBusy === p.category ? 'Joining…' : 'Join waitlist'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(selected.length > 0 || hold) && (
        <div className="checkout-bar">
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {selected.length} seat{selected.length !== 1 ? 's' : ''} selected
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--text)' }}>
              ${total.toFixed(2)}
            </div>
            {hold && (
              <div style={{ marginTop: 4 }}>
                Hold expires in{' '}
                <span className={`hold-timer${remainingMs < 60000 ? ' urgent' : ''}`}>
                  {formatCountdown(remainingMs)}
                </span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {!hold ? (
              <button className="btn btn-primary" onClick={handleHold} disabled={busy || selected.length === 0}>
                {busy ? 'Holding…' : 'Hold seats'}
              </button>
            ) : (
              <>
                <button className="btn btn-ghost" onClick={handleReleaseHold} disabled={busy}>
                  Release
                </button>
                <button className="btn btn-primary" onClick={handleConfirm} disabled={busy}>
                  {busy ? 'Booking…' : 'Confirm booking'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
