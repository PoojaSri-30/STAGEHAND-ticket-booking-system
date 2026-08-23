import { useEffect, useState } from 'react';
import { api } from '../api/client';

const emptyRow = () => ({ row: '', seatsInRow: 10, category: 'Standard' });

export default function AdminVenues() {
  const [venues, setVenues] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [layout, setLayout] = useState([emptyRow()]);

  async function loadVenues() {
    try {
      const { venues } = await api.listVenues();
      setVenues(venues);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadVenues();
  }, []);

  function updateRow(idx, field, value) {
    setLayout((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setLayout((rows) => [...rows, emptyRow()]);
  }

  function removeRow(idx) {
    setLayout((rows) => rows.filter((_, i) => i !== idx));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setCreating(true);
    try {
      const cleanLayout = layout.map((r) => ({
        row: r.row.toUpperCase(),
        seatsInRow: Number(r.seatsInRow),
        category: r.category,
      }));
      await api.createVenue({ name, address, layout: cleanLayout });
      setSuccess(`Venue "${name}" created with ${cleanLayout.reduce((s, r) => s + r.seatsInRow, 0)} seats.`);
      setName('');
      setAddress('');
      setLayout([emptyRow()]);
      loadVenues();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  const totalSeats = layout.reduce((s, r) => s + (Number(r.seatsInRow) || 0), 0);

  return (
    <div>
      <h1 className="page-title">Venues</h1>
      <p className="page-subtitle">Create venues and define their seat layout by row and category.</p>

      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      <div className="card" style={{ marginBottom: 32 }}>
        <h3 style={{ marginTop: 0, fontFamily: 'var(--font-display)', fontSize: 22 }}>New Venue</h3>
        <form onSubmit={handleCreate}>
          <div className="form-field">
            <label>Venue name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-field">
            <label>Address</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>

          <div className="form-field">
            <label>Seat layout ({totalSeats} seats total)</label>
            {layout.map((row, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'center' }}>
                <input
                  placeholder="Row label (e.g. A)"
                  value={row.row}
                  onChange={(e) => updateRow(idx, 'row', e.target.value)}
                  style={{ width: 130 }}
                  required
                />
                <input
                  type="number"
                  min="1"
                  placeholder="Seats in row"
                  value={row.seatsInRow}
                  onChange={(e) => updateRow(idx, 'seatsInRow', e.target.value)}
                  style={{ width: 110 }}
                  required
                />
                <input
                  placeholder="Category (e.g. Premium)"
                  value={row.category}
                  onChange={(e) => updateRow(idx, 'category', e.target.value)}
                  style={{ width: 160 }}
                  required
                />
                {layout.length > 1 && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeRow(idx)}>
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={addRow}>
              + Add row
            </button>
          </div>

          <button className="btn btn-primary" disabled={creating}>
            {creating ? 'Creating…' : 'Create venue'}
          </button>
        </form>
      </div>

      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>Existing Venues</h3>
      {venues.map((v) => (
        <div className="card" key={v.id} style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>{v.name}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{v.address}</div>
        </div>
      ))}
    </div>
  );
}
