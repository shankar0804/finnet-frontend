import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';

/**
 * Admin-only page to manage the allowed vocabulary for niche + language.
 * Any value the WhatsApp bot receives is validated against these lists.
 * Gender is hardcoded to Male/Female/Other (shown read-only for reference).
 */
export default function TaxonomyPage() {
  const { isAdmin } = useAuth();
  const [niches, setNiches] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [genders, setGenders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/allowed-values');
      setNiches(data.niche || []);
      setLanguages(data.language || []);
      setGenders((data.gender || []).map((g) => (typeof g === 'string' ? g : g.value)));
      setErr('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!isAdmin) {
    return (
      <div className="page-container">
        <div className="card" style={{ textAlign: 'center', padding: '60px 24px' }}>
          <h3>Admin access required</h3>
          <p style={{ color: 'var(--text-muted)' }}>Only admins can manage the niche & language taxonomy.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <h1>Taxonomy</h1>
        <p>Controlled vocabulary for niche & language. The WhatsApp bot rejects values not in these lists.</p>
      </header>

      {err && <div className="card" style={{ background: 'var(--danger-bg, #2a1010)', color: 'var(--danger)', marginBottom: 16 }}>{err}</div>}

      <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <TaxonomyList
          title="Niches"
          category="niche"
          values={niches}
          loading={loading}
          onChange={load}
        />
        <TaxonomyList
          title="Languages"
          category="language"
          values={languages}
          loading={loading}
          onChange={load}
        />
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Gender <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 400 }}>(fixed)</span></h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 0 }}>Gender values are hardcoded and cannot be edited.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {genders.map((g) => (
              <span key={g} className="badge badge-accent" style={{ fontSize: '0.85rem', padding: '6px 12px' }}>{g}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TaxonomyList({ title, category, values, loading, onChange }) {
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [localErr, setLocalErr] = useState('');

  const add = async (e) => {
    e.preventDefault();
    const value = input.trim();
    if (!value) return;
    setSaving(true);
    setLocalErr('');
    try {
      await api.post('/api/allowed-values', { category, value });
      setInput('');
      onChange();
    } catch (err) {
      setLocalErr(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id, value) => {
    if (!confirm(`Remove "${value}" from ${title.toLowerCase()}?`)) return;
    try {
      await api.del(`/api/allowed-values/${id}`);
      onChange();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <span className="badge badge-muted">{values.length}</span>
      </div>

      <form onSubmit={add} style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          type="text"
          className="input"
          placeholder={`Add new ${title.toLowerCase().slice(0, -1)}…`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={saving}
          style={{ flex: 1 }}
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !input.trim()}>
          {saving ? '…' : 'Add'}
        </button>
      </form>

      {localErr && <div style={{ color: 'var(--danger)', fontSize: '0.8rem', marginBottom: 10 }}>{localErr}</div>}

      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>Loading…</div>
      ) : values.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20, fontSize: '0.85rem' }}>
          No values yet. Add one above.
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {values.map((v) => (
            <span
              key={v.id}
              className="badge"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 4px 6px 12px', fontSize: '0.85rem',
                background: 'var(--panel-2, rgba(255,255,255,0.05))',
                border: '1px solid var(--border)',
              }}
            >
              {v.value}
              <button
                onClick={() => remove(v.id, v.value)}
                aria-label={`Remove ${v.value}`}
                style={{
                  background: 'transparent', border: 'none', color: 'var(--text-muted)',
                  cursor: 'pointer', padding: '0 6px', fontSize: '1rem', lineHeight: 1,
                }}
                title={`Remove ${v.value}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
