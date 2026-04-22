import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_BASE || '';

/**
 * Visual metadata per backend bot state (bot.js emits these via /api/whatsapp/status).
 * Keeping this table-driven so we don't end up with mismatched labels/colors like
 * "Connected" in the banner but "Offline" in the metric card.
 */
const STATE_META = {
  connected:    { label: 'Connected',         dot: 'var(--success)',    emoji: '🟢', hint: 'The FinBot is live and listening for @finbot mentions.' },
  qr:           { label: 'Awaiting QR Scan',  dot: 'var(--warning)',    emoji: '📱', hint: 'Scan the QR code below from WhatsApp → Settings → Linked Devices.' },
  reconnecting: { label: 'Reconnecting…',     dot: 'var(--warning)',    emoji: '🟡', hint: 'Temporary disconnect — retrying automatically. Hang tight.' },
  logged_out:   { label: 'Logged Out',        dot: 'var(--danger)',     emoji: '🔒', hint: 'Session ended on WhatsApp. A fresh QR will appear in a moment — please rescan.' },
  offline:      { label: 'Offline',           dot: 'var(--text-muted)', emoji: '⚫', hint: 'Bot process is not reachable. It may still be starting up.' },
};

function stateMeta(state) {
  return STATE_META[state] || STATE_META.offline;
}

export default function WhatsAppPage() {
  const { isAdmin } = useAuth();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const intervalRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/whatsapp/status`);
      const data = await res.json();
      setStatus(data);
      setLastUpdated(new Date());
    } catch {
      setStatus({ state: 'offline', qr: null, qrBase64: null, phone: null });
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll faster when we're not steadily connected — a freshly-scanned QR,
  // or a reconnect, should flip the UI within a couple of seconds.
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    const pollMs = status?.state === 'connected' ? 10000 : 3000;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fetchStatus, pollMs);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [status?.state, fetchStatus]);

  const meta = stateMeta(status?.state);
  const showQR = Boolean(status?.qrBase64);
  const isConnected = status?.state === 'connected';
  const isWaiting = status?.state === 'reconnecting' || status?.state === 'logged_out';

  return (
    <div className="page-container">
      <header className="page-header">
        <h1>WhatsApp Bot</h1>
        <p>Monitor the FinBot WhatsApp integration and manage who can talk to it.</p>
      </header>

      <div className="card">
        {loading && !status ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Checking status…</div>
        ) : (
          <>
            {/* ─── Status banner ─── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: meta.dot,
                boxShadow: isConnected ? `0 0 8px ${meta.dot}` : 'none',
              }} />
              <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                {meta.label}
              </span>
              {isConnected && status?.phone && (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  — +{status.phone}
                </span>
              )}
              <div style={{ flex: 1 }} />
              {lastUpdated && (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                  Last checked {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
              <button className="btn btn-ghost btn-sm" onClick={fetchStatus}>↻ Refresh</button>
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 0, marginBottom: 20 }}>
              {meta.hint}
            </p>

            {/* ─── Quick status cards ─── */}
            <div className="metrics-grid" style={{ marginBottom: 20 }}>
              <div className="metric-card">
                <div className="metric-label">Status</div>
                <div className="metric-val" style={{ fontSize: '1rem', color: meta.dot }}>
                  {meta.emoji} {meta.label}
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Phone</div>
                <div className="metric-val" style={{ fontSize: '1rem' }}>
                  {isConnected && status?.phone ? `+${status.phone}` : '—'}
                </div>
              </div>
            </div>

            {/* ─── QR code (shown whenever the bot is waiting to be scanned) ─── */}
            {showQR && !isConnected && (
              <div style={{
                textAlign: 'center',
                padding: 24,
                marginBottom: 8,
                background: 'var(--bg-elevated, rgba(148,163,184,0.04))',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm, 8px)',
              }}>
                <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 4 }}>
                  Link WhatsApp to FinBot
                </div>
                <p style={{ color: 'var(--text-muted)', marginBottom: 14, fontSize: '0.82rem', maxWidth: 420, margin: '0 auto 14px' }}>
                  On your phone: WhatsApp → <strong>Settings</strong> → <strong>Linked devices</strong> → <strong>Link a device</strong>, then point the camera at this QR.
                </p>
                <img
                  src={status.qrBase64}
                  alt="WhatsApp QR"
                  style={{ width: 240, height: 240, borderRadius: 12, border: '1px solid var(--border)', background: '#fff' }}
                />
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: 10 }}>
                  Refreshes automatically every 3 seconds · QR expires after ~60s and is regenerated
                </div>
              </div>
            )}

            {/* ─── Helpful message when there's no QR yet but we're not connected ─── */}
            {!showQR && !isConnected && (
              <div style={{
                textAlign: 'center',
                padding: '20px 16px',
                marginBottom: 8,
                background: 'rgba(234,179,8,0.06)',
                border: '1px solid rgba(234,179,8,0.25)',
                borderRadius: 'var(--radius-sm, 8px)',
                color: 'var(--text-secondary)',
                fontSize: '0.88rem',
              }}>
                {isWaiting ? (
                  <>The bot is {status?.state === 'logged_out' ? 'restarting after being logged out' : 'reconnecting'}. A new QR code will appear here shortly — this page refreshes automatically.</>
                ) : (
                  <>The bot process isn't reporting a QR yet. If this persists for more than a minute, ask a backend operator to restart the WhatsApp bot service.</>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <WhitelistSection isAdmin={isAdmin} />
    </div>
  );
}

function WhitelistSection({ isAdmin }) {
  const [settings, setSettings] = useState({ whitelist_enabled: 'false' });
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [phone, setPhone] = useState('');
  const [label, setLabel] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, list] = await Promise.all([
        api.get('/api/whatsapp/settings'),
        api.get('/api/whatsapp/whitelist'),
      ]);
      setSettings(s || {});
      setEntries(Array.isArray(list) ? list : []);
      setErr('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const enabled = String(settings.whitelist_enabled || 'false').toLowerCase() === 'true';

  const toggleEnforcement = async () => {
    if (!isAdmin) return;
    if (!confirm(`Turn whitelist enforcement ${enabled ? 'OFF' : 'ON'}?\n${enabled ? 'Anyone will be able to text the bot again.' : 'Only whitelisted numbers will be able to text the bot.'}`)) return;
    setSaving(true);
    try {
      await api.post('/api/whatsapp/settings', { key: 'whitelist_enabled', value: !enabled });
      await load();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const add = async (e) => {
    e.preventDefault();
    const cleaned = phone.replace(/\D/g, '');
    if (!cleaned || cleaned.length < 8) {
      setErr('Enter a valid phone number with country code (digits only, e.g. 919876543210).');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      await api.post('/api/whatsapp/whitelist', {
        phone_number: cleaned,
        label: label.trim(),
        scope: 'both',
      });
      setPhone('');
      setLabel('');
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id, phoneStr) => {
    if (!confirm(`Remove ${phoneStr} from the whitelist?`)) return;
    try {
      await api.del(`/api/whatsapp/whitelist/${id}`);
      await load();
    } catch (e) {
      alert(e.message);
    }
  };

  const toggleEntry = async (id) => {
    try {
      await api.post(`/api/whatsapp/whitelist/${id}/toggle`, {});
      await load();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Sender Whitelist</h3>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            When enforcement is ON, only these numbers can DM or mention the bot.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            padding: '4px 10px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600,
            background: enabled ? 'rgba(34,197,94,0.15)' : 'rgba(148,163,184,0.15)',
            color: enabled ? 'var(--success)' : 'var(--text-muted)',
            border: `1px solid ${enabled ? 'var(--success)' : 'var(--border)'}`,
          }}>
            {enabled ? 'ENFORCEMENT ON' : 'ENFORCEMENT OFF'}
          </span>
          {isAdmin && (
            <button
              className={`btn btn-sm ${enabled ? 'btn-danger' : 'btn-primary'}`}
              onClick={toggleEnforcement}
              disabled={saving}
            >
              {enabled ? 'Turn Off' : 'Turn On'}
            </button>
          )}
        </div>
      </div>

      {err && <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: 12 }}>{err}</div>}

      {isAdmin && (
        <form onSubmit={add} style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            type="text"
            className="input"
            placeholder="Phone (with country code, e.g. 919876543210)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={saving}
            style={{ flex: '1 1 240px' }}
          />
          <input
            type="text"
            className="input"
            placeholder="Label (optional, e.g. Saloni)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={saving}
            style={{ flex: '1 1 180px' }}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !phone.trim()}>
            {saving ? '…' : '+ Add'}
          </button>
        </form>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Phone</th><th>Label</th><th>Scope</th><th>Status</th><th>Added</th>{isAdmin && <th>Actions</th>}</tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={isAdmin ? 6 : 5} style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>Loading…</td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={isAdmin ? 6 : 5} style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
                No numbers whitelisted yet.{enabled && ' Turn enforcement off until you add some, or the bot will be unreachable.'}
              </td></tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} style={{ opacity: e.enabled === false ? 0.45 : 1 }}>
                  <td style={{ fontFamily: 'monospace' }}>+{e.phone_number}</td>
                  <td>{e.label || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td><span className="badge badge-muted" style={{ fontSize: '0.75rem' }}>{e.scope || 'both'}</span></td>
                  <td>
                    <span className={`badge ${e.enabled !== false ? 'badge-success' : 'badge-muted'}`} style={{ fontSize: '0.75rem' }}>
                      {e.enabled !== false ? 'active' : 'paused'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {e.created_at ? new Date(e.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                  {isAdmin && (
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleEntry(e.id)}>
                          {e.enabled !== false ? 'Pause' : 'Resume'}
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => remove(e.id, '+' + e.phone_number)}>Remove</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
