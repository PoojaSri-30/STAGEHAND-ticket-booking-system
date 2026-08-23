import { Routes, Route } from 'react-router-dom';
import TopBar from './components/TopBar';
import ProtectedRoute from './components/ProtectedRoute';

import Login from './pages/Login';
import Register from './pages/Register';
import EventsList from './pages/EventsList';
import EventDetail from './pages/EventDetail';
import BookingConfirmed from './pages/BookingConfirmed';
import MyBookings from './pages/MyBookings';
import WaitlistOffer from './pages/WaitlistOffer';
import OrganiserDashboard from './pages/OrganiserDashboard';
import AdminVenues from './pages/AdminVenues';

export default function App() {
  return (
    <div className="app-shell">
      <TopBar />
      <div className="main-content">
        <Routes>
          <Route path="/" element={<EventsList />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/events/:id" element={<EventDetail />} />

          <Route
            path="/booking-confirmed/:id"
            element={
              <ProtectedRoute>
                <BookingConfirmed />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-bookings"
            element={
              <ProtectedRoute>
                <MyBookings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/waitlist-offer/:id"
            element={
              <ProtectedRoute>
                <WaitlistOffer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organiser"
            element={
              <ProtectedRoute roles={['organiser', 'admin']}>
                <OrganiserDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/venues"
            element={
              <ProtectedRoute roles={['admin']}>
                <AdminVenues />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<EventsList />} />
        </Routes>
      </div>
    </div>
  );
}
