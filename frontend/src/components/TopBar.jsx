import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="topbar">
      <NavLink to="/" className="brand">
        <span className="brand-mark">🎟</span>
        STAGEHAND
      </NavLink>
      <div className="nav-links">
        <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          Events
        </NavLink>
        {user && (
          <NavLink to="/my-bookings" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            My Bookings
          </NavLink>
        )}
        {user && (user.role === 'organiser' || user.role === 'admin') && (
          <NavLink to="/organiser" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Organiser
          </NavLink>
        )}
        {user && user.role === 'admin' && (
          <NavLink to="/admin/venues" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Venues
          </NavLink>
        )}
        {user ? (
          <>
            <span className="nav-role-badge">{user.role}</span>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: 10 }}
              onClick={() => {
                logout();
                navigate('/');
              }}
            >
              Log out
            </button>
          </>
        ) : (
          <NavLink to="/login" className="btn btn-primary btn-sm" style={{ marginLeft: 10 }}>
            Log in
          </NavLink>
        )}
      </div>
    </div>
  );
}
