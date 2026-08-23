const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function getToken() {
  return localStorage.getItem('tb_token');
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    /* no body */
  }

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  // auth
  register: (payload) => request('/auth/register', { method: 'POST', body: payload, auth: false }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload, auth: false }),
  me: () => request('/auth/me'),

  // venues
  listVenues: () => request('/venues'),
  getVenue: (id) => request(`/venues/${id}`),
  createVenue: (payload) => request('/venues', { method: 'POST', body: payload }),

  // events
  listEvents: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/events${qs ? `?${qs}` : ''}`, { auth: false });
  },
  getEvent: (id) => request(`/events/${id}`, { auth: false }),
  getSeats: (id) => request(`/events/${id}/seats`, { auth: false }),
  createEvent: (payload) => request('/events', { method: 'POST', body: payload }),
  getEventSummary: (id) => request(`/events/${id}/summary`),

  // bookings
  holdSeats: (payload) => request('/bookings/hold', { method: 'POST', body: payload }),
  releaseHold: (holdId) => request(`/bookings/hold/${holdId}/release`, { method: 'POST' }),
  confirmBooking: (holdId) => request('/bookings/confirm', { method: 'POST', body: { holdId } }),
  myBookings: () => request('/bookings/my'),
  getBooking: (id) => request(`/bookings/${id}`),
  cancelBooking: (id) => request(`/bookings/${id}/cancel`, { method: 'POST' }),

  // waitlist
  joinWaitlist: (payload) => request('/waitlist', { method: 'POST', body: payload }),
  myWaitlist: () => request('/waitlist/my'),
  getWaitlistEntry: (id) => request(`/waitlist/${id}`),
  eventWaitlist: (eventId) => request(`/waitlist/event/${eventId}`),
  acceptWaitlistOffer: (id) => request(`/waitlist/${id}/accept`, { method: 'POST' }),
  declineWaitlistOffer: (id) => request(`/waitlist/${id}/decline`, { method: 'POST' }),
};

export { getToken, API_URL };
