import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('customer');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await register(name, email, password, role);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-wrap">
      <h1 className="page-title">Create account</h1>
      <p className="page-subtitle">Book seats, manage events, or run venues.</p>
      {error && <div className="error-banner">{error}</div>}
      <form className="card" onSubmit={handleSubmit}>
        <div className="form-field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="form-field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="form-field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </div>
        <div className="form-field">
          <label>Account type</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="customer">Customer — book tickets</option>
            <option value="organiser">Organiser — create events</option>
            <option value="admin">Admin — manage venues</option>
          </select>
        </div>
        <button className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p style={{ marginTop: 16, fontSize: 13.5, color: 'var(--text-muted)' }}>
        Already have an account? <Link to="/login" style={{ color: 'var(--gold)' }}>Log in</Link>
      </p>
    </div>
  );
}
