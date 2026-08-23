import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';

function formatCountdown(ms) {
  if (ms <= 0) return 'Expired';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export default function WaitlistOffer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [entry, setEntry] = useState(null);
  const [event, setEvent] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    api
      .getWaitlistEntry(id)
      .then(async ({ waitlistEntry }) => {
        setEntry(waitlistEntry);
        const { event } = await api.getEvent(waitlistEntry.event_id);
        setEvent(event);
      })
      .catch((err) => setError(err.message));
  }, [id]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function handleAccept() {
    setBusy(true);
    setError('');
    try {
      const { booking } = await api.acceptWaitlistOffer(id);
      navigate(`/booking-confirmed/${booking.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDecline() {
    setBusy(true);
    setError('');
    try {
      await api.declineWaitlistOffer(id);
      navigate('/my-bookings');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !entry) return <div className="error-banner">{error}</div>;
  if (!entry) {
    return (
      <div className="center-loading">
        <div className="spinner" />
      </div>
    );
  }

  const remainingMs = entry.offer_expires_at ? new Date(entry.offer_expires_at).getTime() - now : 0;
  const isActive = entry.status === 'offered' && remainingMs > 0;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <h1 className="page-title">Waitlist Offer</h1>
      {event && <p className="page-subtitle">{event.title} — {entry.category}</p>}

      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ textAlign: 'center' }}>
        <span className={`status-pill ${entry.status}`} style={{ margin: '0 auto 16px', display: 'inline-flex' }}>
          {entry.status}
        </span>

        {isActive ? (
          <>
            <p>A seat opened up! Complete your booking before the offer expires.</p>
            <div className="hold-timer urgent" style={{ fontSize: 28, margin: '12px 0' }}>
              {formatCountdown(remainingMs)}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={handleDecline} disabled={busy}>
                Decline
              </button>
              <button className="btn btn-primary" onClick={handleAccept} disabled={busy}>
                {busy ? 'Booking…' : 'Accept & Book'}
              </button>
            </div>
          </>
        ) : entry.status === 'waiting' ? (
          <p>You're still waiting in line. We'll email you the moment a seat opens up.</p>
        ) : entry.status === 'booked' ? (
          <p>You already booked this seat. Check your bookings for details.</p>
        ) : (
          <p>This offer is no longer available — it expired or was declined and passed to the next person in line.</p>
        )}
      </div>
    </div>
  );
}
