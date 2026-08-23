const nodemailer = require('nodemailer');
const db = require('../db');
const { id } = require('../utils/id');
require('dotenv').config();

let transporterPromise = null;

async function getTransporter() {
  if (transporterPromise) return transporterPromise;

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporterPromise = Promise.resolve(
      nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
    );
  } else {
    // No SMTP configured -> spin up a free Ethereal test inbox.
    // Emails don't actually reach a real address, but a preview URL is printed
    // to the console/logged in email_log so you can view the rendered email.
    transporterPromise = nodemailer.createTestAccount().then((testAccount) =>
      nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      })
    );
  }
  return transporterPromise;
}

async function sendMail({ to, subject, html, attachments = [] }) {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || '"Ticket Booking" <no-reply@ticketbooking.dev>',
    to,
    subject,
    html,
    attachments,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info) || null;
  if (previewUrl) {
    console.log(`\n[EMAIL] "${subject}" to ${to}`);
    console.log(`[EMAIL] Preview: ${previewUrl}\n`);
  }

  db.prepare(
    `INSERT INTO email_log (id, to_email, subject, preview_url) VALUES (?,?,?,?)`
  ).run(id('mail'), to, subject, previewUrl);

  return { info, previewUrl };
}

async function sendBookingConfirmation({ to, name, booking, event, seats, qrDataUrl }) {
  const seatList = seats.map((s) => `${s.row_label}${s.seat_number} (${s.category})`).join(', ');
  const base64Data = qrDataUrl.split(',')[1];

  const html = `
    <div style="font-family: -apple-system, Arial, sans-serif; max-width: 560px; margin: auto;">
      <h2 style="color:#4f46e5;">Booking Confirmed 🎟️</h2>
      <p>Hi ${name},</p>
      <p>Your booking for <strong>${event.title}</strong> is confirmed.</p>
      <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding:4px 0;color:#666;">Booking Ref</td><td style="padding:4px 0;font-weight:600;">${booking.booking_ref}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Date / Time</td><td style="padding:4px 0;">${event.event_date} ${event.event_time}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Seats</td><td style="padding:4px 0;">${seatList}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Total</td><td style="padding:4px 0;font-weight:600;">$${booking.total_amount.toFixed(2)}</td></tr>
      </table>
      <p>Scan the QR code below at entry:</p>
      <img src="cid:qrcode" alt="QR Ticket" style="width:200px;height:200px;" />
      <p style="color:#888;font-size:12px;margin-top:24px;">This ticket is tied to booking reference ${booking.booking_ref}. Do not share it publicly.</p>
    </div>
  `;

  return sendMail({
    to,
    subject: `Your ticket for ${event.title} - ${booking.booking_ref}`,
    html,
    attachments: [
      { filename: 'ticket-qr.png', content: Buffer.from(base64Data, 'base64'), cid: 'qrcode' },
    ],
  });
}

async function sendWaitlistOffer({ to, name, event, seats, waitlistEntry, offerUrl, expiresAt }) {
  const seatList = seats.map((s) => `${s.row_label}${s.seat_number} (${s.category})`).join(', ');
  const html = `
    <div style="font-family: -apple-system, Arial, sans-serif; max-width: 560px; margin: auto;">
      <h2 style="color:#059669;">A seat opened up! 🎉</h2>
      <p>Hi ${name},</p>
      <p>A seat you waitlisted for <strong>${event.title}</strong> is now available: <strong>${seatList}</strong>.</p>
      <p>This offer is held for you until <strong>${expiresAt}</strong>. Complete your booking before it expires or it will pass to the next person in line.</p>
      <p><a href="${offerUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Complete Booking</a></p>
    </div>
  `;
  return sendMail({ to, subject: `Seat available: ${event.title} (offer expires soon)`, html });
}

module.exports = { sendMail, sendBookingConfirmation, sendWaitlistOffer };
