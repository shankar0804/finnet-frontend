import { useState } from 'react';
import { api } from '../../utils/api';
import { formatMoney, formatNumber, formatDate } from '../../utils/formatters';

/** Level 2: Campaign summary dashboard with entry management */
export default function CampaignSummary({ brand, campaign, metrics, onViewEntries, onRefreshEntries }) {
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [entryError, setEntryError] = useState('');
  const [entrySuccess, setEntrySuccess] = useState('');
  const [entrySkipped, setEntrySkipped] = useState(null);
  const [entrySubmitting, setEntrySubmitting] = useState(false);
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [importSummary, setImportSummary] = useState(null);
  const [importing, setImporting] = useState(false);
  const [excelFile, setExcelFile] = useState(null);

  // ─── Add Single Entry ───
  // Accepts a content link, a screenshot, or both. Creator username is
  // optional — it will be pulled from the scrape/OCR if not provided.
  const addEntry = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const creator_username = (fd.get('creator_username') || '').trim();
    const content_link = (fd.get('content_link') || '').trim();
    if (!content_link && !screenshotFile && !creator_username) {
      setEntryError('Provide a content link, a screenshot, or a creator username.');
      return;
    }
    setEntryError('');
    setEntrySuccess('');
    setEntrySkipped(null);
    setEntrySubmitting(true);

    const payload = new FormData();
    payload.append('campaign_id', campaign.id);
    if (creator_username) payload.append('creator_username', creator_username);
    payload.append('deliverable_type', fd.get('deliverable_type') || 'Reel');
    payload.append('content_link', content_link);
    payload.append('amount', fd.get('amount') || 0);
    if (fd.get('delivery_date')) payload.append('delivery_date', fd.get('delivery_date'));
    payload.append('poc', (fd.get('poc') || '').trim());
    payload.append('notes', (fd.get('notes') || '').trim());
    if (screenshotFile) payload.append('screenshot', screenshotFile);

    try {
      const result = await api.upload('/api/entries', payload);
      if (result && result.skipped) {
        setEntrySkipped(result);
      } else {
        const who = creator_username || result.creator_username || 'creator';
        setEntrySuccess(`Entry for @${who} added.`);
        e.target.reset();
        setScreenshotFile(null);
        if (onRefreshEntries) onRefreshEntries();
      }
    } catch (err) {
      setEntryError(err.message);
    } finally {
      setEntrySubmitting(false);
    }
  };

  // ─── Google Sheets Import ───
  const importSheet = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const sheet_url = fd.get('sheet_url')?.trim();
    if (!sheet_url) { setImportError('Paste a Google Sheet URL.'); return; }
    setImporting(true);
    setImportError('');
    setImportSuccess('');
    setImportSummary(null);
    try {
      const result = await api.post(`/api/campaigns/${campaign.id}/import-sheet`, { sheet_url });
      setImportSuccess(`Imported ${result.imported} of ${result.total || result.imported} rows.`);
      setImportSummary(result);
      e.target.reset();
      if (onRefreshEntries) onRefreshEntries();
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting(false);
    }
  };

  // ─── Excel (.xlsx) Import with embedded images ───
  const importExcel = async (e) => {
    e.preventDefault();
    if (!excelFile) { setImportError('Pick an .xlsx file first.'); return; }
    setImporting(true);
    setImportError('');
    setImportSuccess('');
    setImportSummary(null);
    const form = new FormData();
    form.append('file', excelFile);
    try {
      const result = await api.upload(`/api/campaigns/${campaign.id}/import-excel`, form);
      setImportSuccess(`Imported ${result.imported} of ${result.total || result.imported} rows.`);
      setImportSummary(result);
      setExcelFile(null);
      if (onRefreshEntries) onRefreshEntries();
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const platformsList = (campaign.platforms || '').split(',').filter(Boolean).map(p => p.trim()).join(', ');

  return (
    <>
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <h1>{campaign.campaign_name}</h1>
            <p>{brand.brand_name} · {platformsList} · {formatDate(campaign.start_date)} — {formatDate(campaign.end_date)}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowAddEntry(!showAddEntry); setShowImport(false); }}>
              {showAddEntry ? 'Cancel' : '+ Add Entry'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowImport(!showImport); setShowAddEntry(false); }}>
              {showImport ? 'Cancel' : '📊 Import Sheet'}
            </button>
            <button className="btn btn-primary" onClick={onViewEntries}>View All Entries →</button>
          </div>
        </div>
      </header>

      {/* ─── Add Single Entry Form ─── */}
      {showAddEntry && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 4 }}>Add Creator Entry</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 12 }}>
            Paste an Instagram / YouTube / LinkedIn post link, attach a screenshot of the
            insights, or both. Views, likes, engagement etc. are pulled automatically.
            The creator must already exist in the roster (or have enough scraped data
            for us to add them for you).
          </p>
          <form onSubmit={addEntry} encType="multipart/form-data">
            <div className="form-row" style={{ marginBottom: 8 }}>
              <div className="form-group" style={{ flex: 1.2 }}>
                <label className="form-label">Creator Username</label>
                <input className="input" name="creator_username" placeholder="optional — inferred from link" />
              </div>
              <div className="form-group" style={{ flex: 0.6 }}>
                <label className="form-label">Deliverable</label>
                <select className="select" name="deliverable_type" defaultValue="Reel">
                  <option>Reel</option>
                  <option>Story</option>
                  <option>Post</option>
                  <option>Video</option>
                  <option>Other</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 0.5 }}>
                <label className="form-label">Amount (₹)</label>
                <input className="input" name="amount" type="number" placeholder="0" />
              </div>
              <div className="form-group" style={{ flex: 0.5 }}>
                <label className="form-label">Delivery Date</label>
                <input className="input" name="delivery_date" type="date" />
              </div>
            </div>
            <div className="form-row" style={{ marginBottom: 10 }}>
              <div className="form-group" style={{ flex: 1.3 }}>
                <label className="form-label">Content Link</label>
                <input className="input" name="content_link" placeholder="https://instagram.com/reel/... | youtube.com/watch?v=... | linkedin.com/posts/..." />
              </div>
              <div className="form-group" style={{ flex: 0.6 }}>
                <label className="form-label">PoC</label>
                <input className="input" name="poc" placeholder="Assigned to" />
              </div>
              <div className="form-group" style={{ flex: 0.8 }}>
                <label className="form-label">Notes</label>
                <input className="input" name="notes" placeholder="Optional" />
              </div>
            </div>
            <div className="form-row" style={{ marginBottom: 10 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Insights Screenshot (optional)</label>
                <input
                  className="input"
                  type="file"
                  accept="image/*"
                  onChange={(ev) => setScreenshotFile(ev.target.files?.[0] || null)}
                />
                {screenshotFile && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Attached: {screenshotFile.name} · {(screenshotFile.size / 1024).toFixed(0)} KB
                  </div>
                )}
              </div>
            </div>
            <button className="btn btn-primary btn-sm" type="submit" disabled={entrySubmitting}>
              {entrySubmitting ? 'Processing…' : 'Add Entry'}
            </button>
            {entryError && <div className="error-box" style={{ marginTop: 8 }}>{entryError}</div>}
            {entrySuccess && (
              <div style={{ marginTop: 8, padding: '8px 14px', background: 'var(--success-light)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 'var(--radius-sm)', color: 'var(--success)', fontSize: '0.82rem' }}>
                {entrySuccess}
              </div>
            )}
            {entrySkipped && (
              <div style={{ marginTop: 8, padding: '10px 14px', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem' }}>
                <strong>Skipped.</strong> {entrySkipped.reason}
                {entrySkipped.missing_creator && (
                  <div style={{ marginTop: 4, color: 'var(--text-muted)' }}>
                    Add <code>@{entrySkipped.missing_creator}</code> to the roster first, then retry.
                  </div>
                )}
              </div>
            )}
          </form>
        </div>
      )}

      {/* ─── Bulk Import Form (Google Sheet + .xlsx with embedded images) ─── */}
      {showImport && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 6 }}>Bulk Import</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: 12 }}>
            Each row needs a <code>link</code> to an IG / YouTube / LinkedIn post, and may
            also carry a screenshot (for Excel, paste images right into the row's cells).
            Columns we recognise: <code>username</code>, <code>deliverable</code>, <code>amount</code>,
            <code>date</code>, <code>link</code>, <code>poc</code>, <code>notes</code>. Rows whose creator
            isn't in the roster yet will come back in a skipped list.
          </p>

          <form onSubmit={importSheet} style={{ marginBottom: 12 }}>
            <label className="form-label">Google Sheet URL</label>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <input className="input" name="sheet_url" placeholder="https://docs.google.com/spreadsheets/d/..." style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
              </div>
              <button className="btn btn-primary btn-sm" type="submit" disabled={importing} style={{ alignSelf: 'flex-end' }}>
                {importing ? 'Importing…' : 'Import Sheet'}
              </button>
            </div>
          </form>

          <form onSubmit={importExcel} encType="multipart/form-data">
            <label className="form-label">…or upload an .xlsx file (supports embedded screenshots)</label>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <input
                  className="input"
                  type="file"
                  accept=".xlsx"
                  onChange={(ev) => setExcelFile(ev.target.files?.[0] || null)}
                />
                {excelFile && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    {excelFile.name} · {(excelFile.size / 1024).toFixed(0)} KB
                  </div>
                )}
              </div>
              <button className="btn btn-primary btn-sm" type="submit" disabled={importing || !excelFile} style={{ alignSelf: 'flex-end' }}>
                {importing ? 'Importing…' : 'Import Excel'}
              </button>
            </div>
          </form>

          {importError && <div className="error-box" style={{ marginTop: 8 }}>{importError}</div>}
          {importSuccess && (
            <div style={{ marginTop: 8, padding: '8px 14px', background: 'var(--success-light)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 'var(--radius-sm)', color: 'var(--success)', fontSize: '0.82rem' }}>
              {importSuccess}
            </div>
          )}
          {importSummary && (importSummary.skipped?.length > 0 || importSummary.failed?.length > 0) && (
            <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem' }}>
              {importSummary.skipped?.length > 0 && (
                <>
                  <strong>Skipped ({importSummary.skipped.length})</strong>
                  <ul style={{ margin: '6px 0 10px 18px' }}>
                    {importSummary.skipped.slice(0, 20).map((s, i) => (
                      <li key={`sk-${i}`}>
                        Row {s.row}
                        {s.username ? <> · <code>@{s.username}</code></> : null}
                        {s.platform ? <> · {s.platform}</> : null}
                        {' '}— {s.reason}
                      </li>
                    ))}
                    {importSummary.skipped.length > 20 && <li>…and {importSummary.skipped.length - 20} more</li>}
                  </ul>
                </>
              )}
              {importSummary.failed?.length > 0 && (
                <>
                  <strong>Failed ({importSummary.failed.length})</strong>
                  <ul style={{ margin: '6px 0 0 18px' }}>
                    {importSummary.failed.slice(0, 10).map((f, i) => (
                      <li key={`fl-${i}`}>Row {f.row} — {f.error}</li>
                    ))}
                    {importSummary.failed.length > 10 && <li>…and {importSummary.failed.length - 10} more</li>}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Brand + PoC info */}
      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Brand PoC</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {(brand.brand_poc || []).filter(Boolean).map((p, i) => (
                <span key={i} className="brand-poc-chip">{p}</span>
              ))}
            </div>
          </div>
          <div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Finnet PoC</span>
            <div style={{ marginTop: 4 }}>
              <span className="brand-poc-chip finnet">{brand.finnet_poc}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content Summary */}
      {metrics && (
        <div className="card">
          <h3>Content Summary</h3>
          <div className="metrics-grid">
            <MetricCard label="Total Entries" value={metrics.entryCount || 0} />
            <MetricCard label="Live Content" value={metrics.liveCount || 0} accent />
            <MetricCard label="Total Spend" value={formatMoney(metrics.totalSpend)} />
            <MetricCard label="Budget" value={formatMoney(campaign.budget)} />
          </div>
        </div>
      )}
    </>
  );
}

function MetricCard({ label, value, accent }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-val" style={accent ? { color: 'var(--accent-hover)' } : undefined}>{value}</div>
    </div>
  );
}
