import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('customer@ticketing.dev');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-wrap">
      <h1 className="page-title">Welcome back</h1>
      <p className="page-subtitle">Log in to book seats and manage your tickets.</p>
      {error && <div className="error-banner">{error}</div>}
      <form className="card" onSubmit={handleSubmit}>
        <div className="form-field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="form-field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p style={{ marginTop: 16, fontSize: 13.5, color: 'var(--text-muted)' }}>
        No account? <Link to="/register" style={{ color: 'var(--gold)' }}>Register</Link>
      </p>
      <p style={{ marginTop: 20, fontSize: 12, color: 'var(--text-faint)' }}>
        Seed accounts (password: password123): admin@ticketing.dev · organiser@ticketing.dev ·
        customer@ticketing.dev · customer2@ticketing.dev
      </p>
    </div>
  );
}
