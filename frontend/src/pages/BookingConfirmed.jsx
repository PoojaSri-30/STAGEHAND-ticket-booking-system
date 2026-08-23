import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';

export default function BookingConfirmed() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getBooking(id)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!data) {
    return (
      <div className="center-loading">
        <div className="spinner" />
      </div>
    );
  }

  const { booking, seats } = data;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <div className="success-banner">Booking confirmed — a copy has been emailed to you.</div>
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="event-type-tag" style={{ justifyContent: 'center', display: 'flex' }}>
          Ticket
        </div>
        <h1 className="ticket-ref" style={{ fontSize: 20, margin: '6px 0 16px' }}>
          {booking.booking_ref}
        </h1>
        {booking.qr_code_data && (
          <img
            src={booking.qr_code_data}
            alt="Booking QR code"
            style={{ width: 220, height: 220, borderRadius: 8, background: '#fff', padding: 8 }}
          />
        )}
        <div style={{ marginTop: 16, textAlign: 'left' }}>
          <table className="data-table">
            <tbody>
              <tr>
                <td>Seats</td>
                <td>{seats.map((s) => `${s.row_label}${s.seat_number}`).join(', ')}</td>
              </tr>
              <tr>
                <td>Total</td>
                <td>${booking.total_amount.toFixed(2)}</td>
              </tr>
              <tr>
                <td>Status</td>
                <td>
                  <span className="status-pill confirmed">{booking.status}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'center' }}>
        <Link to="/my-bookings" className="btn btn-ghost">
          View my bookings
        </Link>
        <Link to="/" className="btn btn-primary">
          Browse more events
        </Link>
      </div>
    </div>
  );
}
