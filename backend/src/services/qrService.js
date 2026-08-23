const QRCode = require('qrcode');

/**
 * Encodes the booking reference (plus a couple identifying fields) into a QR code.
 * Returns a data URL (base64 PNG) suitable for emailing or displaying in the frontend.
 */
async function generateBookingQR(booking) {
  const payload = JSON.stringify({
    ref: booking.booking_ref,
    bookingId: booking.id,
    eventId: booking.event_id,
  });
  return QRCode.toDataURL(payload, { width: 300, margin: 2 });
}

module.exports = { generateBookingQR };
