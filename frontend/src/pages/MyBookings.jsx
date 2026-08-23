import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

export default function MyBookings() {
  const [tab, setTab] = useState('bookings');
  const [bookings, setBookings] = useState(null);
  const [waitlist, setWaitlist] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  async function loadBookings() {
    try {
      const { bookings } = await api.myBookings();
      setBookings(bookings);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadWaitlist() {
    try {
      const { waitlist } = await api.myWaitlist();
      setWaitlist(waitlist);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadBookings();
    loadWaitlist();
  }, []);

  async function handleCancel(bookingId) {
    if (!confirm('Cancel this booking? Your seats will be released and offered to the waitlist.')) return;
    setBusyId(bookingId);
    setError('');
    try {
      await api.cancelBooking(bookingId);
      await loadBookings();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="page-title">My Tickets</h1>
      <p className="page-subtitle">Your booking history and waitlist status.</p>

      <div className="tabs">
        <button className={`tab${tab === 'bookings' ? ' active' : ''}`} onClick={() => setTab('bookings')}>
          Bookings
        </button>
        <button className={`tab${tab === 'waitlist' ? ' active' : ''}`} onClick={() => setTab('waitlist')}>
          Waitlist
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {tab === 'bookings' && (
        <>
          {!bookings && (
            <div className="center-loading">
              <div className="spinner" />
            </div>
          )}
          {bookings && bookings.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-title">No bookings yet</div>
              <p>
                <Link to="/" style={{ color: 'var(--gold)' }}>Browse events</Link> to book your first ticket.
              </p>
            </div>
          )}
          {bookings &&
            bookings.map((b) => (
              <div className="ticket-stub" key={b.id}>
                <div className="ticket-stub-main">
                  <span className="ticket-ref">{b.booking_ref}</span>
                  <h3 className="ticket-title">{b.event_title}</h3>
                  <div className="ticket-meta-row">
                    <span>{b.event_date} · {b.event_time}</span>
                    <span>${b.total_amount.toFixed(2)}</span>
                  </div>
                  <span className={`status-pill ${b.status}`}>{b.status}</span>
                </div>
                <div className="ticket-stub-divider" />
                <div className="ticket-stub-side">
                  {b.status === 'confirmed' ? (
                    <>
                      <Link to={`/booking-confirmed/${b.id}`} className="btn btn-ghost btn-sm btn-block">
                        View QR
                      </Link>
                      <button
                        className="btn btn-danger btn-sm btn-block"
                        onClick={() => handleCancel(b.id)}
                        disabled={busyId === b.id}
                      >
                        {busyId === b.id ? 'Cancelling…' : 'Cancel'}
                      </button>
                    </>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>No further action</span>
                  )}
                </div>
              </div>
            ))}
        </>
      )}

      {tab === 'waitlist' && (
        <>
          {!waitlist && (
            <div className="center-loading">
              <div className="spinner" />
            </div>
          )}
          {waitlist && waitlist.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-title">Not on any waitlists</div>
              <p>When an event category is sold out, you can join its waitlist from the event page.</p>
            </div>
          )}
          {waitlist &&
            waitlist.map((w) => (
              <div className="card" key={w.id} style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{w.category}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Position #{w.position} in queue · Qty {w.quantity}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className={`status-pill ${w.status}`}>{w.status}</span>
                  {w.status === 'offered' && (
                    <Link to={`/waitlist-offer/${w.id}`} className="btn btn-primary btn-sm">
                      View offer
                    </Link>
                  )}
                </div>
              </div>
            ))}
        </>
      )}
    </div>
  );
}
