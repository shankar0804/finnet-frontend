import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../utils/api';
import { formatMoney, formatDate } from '../utils/formatters';
import CampaignSummary from './brands/CampaignSummary';
import EntryTables from './brands/EntryTables';
import EntryDetail from './brands/EntryDetail';

// ─── Metric helpers (mirror of BrandsPage.computeCampaignMetrics) ──────
const PLATFORM_LABELS = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  twitter: 'Twitter',
  custom: 'Other',
};

function parsePct(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = parseFloat(s.replace('%', ''));
  return Number.isFinite(n) ? n : null;
}

function computeCampaignMetrics(grouped) {
  const all = Object.values(grouped || {}).flat();
  if (all.length === 0) return null;

  const totalViews = all.reduce((s, e) => s + (e.video_views || e.impressions || 0), 0);
  const totalLikes = all.reduce((s, e) => s + (e.likes || e.reacts || 0), 0);
  const totalComments = all.reduce((s, e) => s + (e.comments || 0), 0);
  const totalShares = all.reduce((s, e) => s + (e.shares || e.reshares || e.retweets || 0), 0);
  const totalSaves = all.reduce((s, e) => s + (e.saves || 0), 0);
  const totalSpend = all.reduce((s, e) => s + parseFloat(e.amount || e.commercials || 0), 0);
  const totalEngagement = totalLikes + totalComments + totalShares + totalSaves;

  let erWeighted = 0;
  let erWeight = 0;
  for (const e of all) {
    const w = e.video_views || e.impressions || 0;
    const er = parseFloat(e.engagement_rate || 0);
    if (w > 0 && er > 0) {
      erWeighted += er * w;
      erWeight += w;
    }
  }
  const avgEngagementRate = erWeight > 0 ? erWeighted / erWeight : 0;

  const fmtMap = new Map();
  for (const e of all) {
    const plat = (e.platform || 'custom').toLowerCase();
    const asset = e.deliverable_type || e.deliverable || 'Other';
    const key = `${plat}||${asset}`;
    fmtMap.set(key, (fmtMap.get(key) || 0) + 1);
  }
  const formats = Array.from(fmtMap.entries())
    .map(([k, qty]) => {
      const [plat, asset] = k.split('||');
      return { platform: PLATFORM_LABELS[plat] || plat, asset, quantity: qty };
    })
    .sort((a, b) => a.platform.localeCompare(b.platform) || a.asset.localeCompare(b.asset));

  const ageKeys = ['age_13_17', 'age_18_24', 'age_25_34', 'age_35_44', 'age_45_54'];
  const ageAcc = Object.fromEntries(ageKeys.map((k) => [k, { sum: 0, weight: 0 }]));
  const genderAcc = { male: { sum: 0, weight: 0 }, female: { sum: 0, weight: 0 } };
  const cityCounts = new Map();

  for (const e of all) {
    const d = e.demographics || {};
    const w = e.video_views || e.impressions || 1;
    for (const k of ageKeys) {
      const v = parsePct(d[k]);
      if (v != null) {
        ageAcc[k].sum += v * w;
        ageAcc[k].weight += w;
      }
    }
    for (const g of ['male', 'female']) {
      const v = parsePct(d[g]);
      if (v != null) {
        genderAcc[g].sum += v * w;
        genderAcc[g].weight += w;
      }
    }
    for (const city of d.cities || []) {
      const trimmed = String(city || '').trim();
      if (trimmed) cityCounts.set(trimmed, (cityCounts.get(trimmed) || 0) + 1);
    }
  }

  const demographics = {
    age_13_17: ageAcc.age_13_17.weight ? (ageAcc.age_13_17.sum / ageAcc.age_13_17.weight).toFixed(0) + '%' : '',
    age_18_24: ageAcc.age_18_24.weight ? (ageAcc.age_18_24.sum / ageAcc.age_18_24.weight).toFixed(0) + '%' : '',
    age_25_34: ageAcc.age_25_34.weight ? (ageAcc.age_25_34.sum / ageAcc.age_25_34.weight).toFixed(0) + '%' : '',
    age_35_44: ageAcc.age_35_44.weight ? (ageAcc.age_35_44.sum / ageAcc.age_35_44.weight).toFixed(0) + '%' : '',
    age_45_54: ageAcc.age_45_54.weight ? (ageAcc.age_45_54.sum / ageAcc.age_45_54.weight).toFixed(0) + '%' : '',
    male: genderAcc.male.weight ? (genderAcc.male.sum / genderAcc.male.weight).toFixed(0) + '%' : '',
    female: genderAcc.female.weight ? (genderAcc.female.sum / genderAcc.female.weight).toFixed(0) + '%' : '',
    cities: Array.from(cityCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c),
  };

  const hasAnyDemographics =
    ageKeys.some((k) => ageAcc[k].weight > 0) ||
    genderAcc.male.weight > 0 ||
    genderAcc.female.weight > 0 ||
    demographics.cities.length > 0;

  return {
    totalInfluencers: all.length,
    entryCount: all.length,
    liveCount: all.filter((e) => e.content_link).length,
    totalViews,
    totalLikes,
    totalComments,
    totalShares,
    totalSaves,
    totalEngagement,
    avgEngagementRate,
    totalSpend,
    cpv: totalViews > 0 ? totalSpend / totalViews : 0,
    cpe: totalEngagement > 0 ? totalSpend / totalEngagement : 0,
    formats,
    demographics,
    hasDemographics: hasAnyDemographics,
  };
}

/** Group a flat entry list by platform, matching the shape EntryTables
 *  consumes (`{ instagram: [...], youtube: [...], ... }`). */
function groupByPlatform(list) {
  const grouped = { instagram: [], youtube: [], linkedin: [], twitter: [], custom: [] };
  for (const e of list || []) {
    const key = (e?.platform || 'instagram').toLowerCase();
    (grouped[key] || grouped.custom).push(e);
  }
  return grouped;
}

/**
 * Brand Portal — view-only mirror of the internal Brand Management flow.
 * Route: /brand-portal/:hash
 *
 *   Level 1 — Brand overview + campaign list
 *   Level 2 — Campaign summary dashboard (aggregated metrics, demographics)
 *   Level 3 — Per-platform entry tables
 *   Level 4 — Expanded entry detail (demographics, caption, transcript)
 */
export default function BrandPortalPage() {
  const { hash } = useParams();
  const [brand, setBrand] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [level, setLevel] = useState(1);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [selectedPlatform, setSelectedPlatform] = useState(null);

  useEffect(() => {
    if (!hash) { setLoading(false); return; }
    api.get(`/api/brand-portal/${hash}`)
      .then(setBrand)
      .catch((err) => setError(err.message || 'Brand not found'))
      .finally(() => setLoading(false));
  }, [hash]);

  // Entries for the selected campaign — grouped by platform for EntryTables /
  // CampaignSummary. Always derived from the campaign chosen in state so we
  // never stale-read a previous campaign's entries.
  const groupedEntries = useMemo(
    () => groupByPlatform(selectedCampaign?.entries || []),
    [selectedCampaign]
  );
  const metrics = useMemo(() => computeCampaignMetrics(groupedEntries), [groupedEntries]);

  // Shape the brand object the way CampaignSummary expects (brand_poc array).
  const brandForUI = useMemo(() => {
    if (!brand) return null;
    return {
      ...brand,
      brand_poc: [brand.brand_poc_1, brand.brand_poc_2, brand.brand_poc_3].filter(Boolean),
    };
  }, [brand]);

  const goBack = (toLevel) => {
    setLevel(toLevel);
    if (toLevel <= 3) setSelectedEntry(null);
    if (toLevel <= 1) setSelectedCampaign(null);
  };

  if (loading) {
    return (
      <div className="page-container" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
        Loading brand portal…
      </div>
    );
  }

  if (error || !brand) {
    return (
      <div className="page-container">
        <div className="card" style={{ textAlign: 'center', padding: '60px 24px' }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>🔒</div>
          <h3 style={{ marginBottom: 8 }}>Access Denied</h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: 400, margin: '0 auto' }}>
            {error || 'This brand portal link is invalid or you do not have access.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <button
          className={`breadcrumb-item${level === 1 ? ' active' : ''}`}
          onClick={() => goBack(1)}
        >
          {brand.brand_name}
        </button>
        {level >= 2 && selectedCampaign && (
          <>
            <span className="breadcrumb-sep">›</span>
            <button
              className={`breadcrumb-item${level === 2 ? ' active' : ''}`}
              onClick={() => goBack(2)}
            >
              {selectedCampaign.campaign_name}
            </button>
          </>
        )}
        {level >= 3 && selectedCampaign && (
          <>
            <span className="breadcrumb-sep">›</span>
            <button
              className={`breadcrumb-item${level === 3 ? ' active' : ''}`}
              onClick={() => goBack(3)}
            >
              Entries
            </button>
          </>
        )}
        {level === 4 && selectedEntry && (
          <>
            <span className="breadcrumb-sep">›</span>
            <span className="breadcrumb-item active">
              {selectedEntry.creator_name || `@${selectedEntry.creator_username || ''}`}
            </span>
          </>
        )}
      </div>

      {level === 1 && (
        <BrandOverview
          brand={brand}
          onSelectCampaign={(c) => { setSelectedCampaign(c); setLevel(2); }}
        />
      )}

      {level === 2 && selectedCampaign && brandForUI && (
        <CampaignSummary
          readOnly
          brand={brandForUI}
          campaign={selectedCampaign}
          metrics={metrics}
          onViewEntries={() => setLevel(3)}
          onRefreshEntries={() => { /* brand portal is read-only */ }}
        />
      )}

      {level === 3 && selectedCampaign && (
        <EntryTables
          campaign={selectedCampaign}
          entries={groupedEntries}
          onSelectEntry={(entry, platform) => {
            setSelectedEntry(entry);
            setSelectedPlatform(platform);
            setLevel(4);
          }}
        />
      )}

      {level === 4 && selectedEntry && (
        <EntryDetail entry={selectedEntry} platform={selectedPlatform} />
      )}
    </div>
  );
}

/* ─── Level 1: Brand overview with campaign list ─── */
function BrandOverview({ brand, onSelectCampaign }) {
  const campaigns = brand.campaigns || [];

  return (
    <>
      <header className="page-header">
        <h1>{brand.brand_name}</h1>
        <p>Your dedicated brand dashboard</p>
      </header>

      {/* PoC Info */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <span className="form-label">Brand Contacts</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {[brand.brand_poc_1, brand.brand_poc_2, brand.brand_poc_3].filter(Boolean).map((p, i) => (
                <span key={i} className="brand-poc-chip">{p}</span>
              ))}
              {![brand.brand_poc_1, brand.brand_poc_2, brand.brand_poc_3].some(Boolean) && (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>—</span>
              )}
            </div>
          </div>
          {brand.finnet_poc && (
            <div>
              <span className="form-label">Finnet PoC</span>
              <div style={{ marginTop: 4 }}>
                <span className="brand-poc-chip finnet">{brand.finnet_poc}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Campaigns — list with per-row overview (mirrors internal BrandList chip style) */}
      <div className="card">
        <h3>Campaigns <span className="badge badge-muted" style={{ marginLeft: 8 }}>{campaigns.length}</span></h3>
        {campaigns.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No campaigns yet.</p>
        ) : (
          <div className="campaign-chips" style={{ flexDirection: 'column' }}>
            {campaigns.map((c) => {
              const entries = c.entries || [];
              const liveCount = entries.filter((e) => e.content_link).length;
              const platformList = (c.platforms || '').split(',').map((p) => p.trim()).filter(Boolean);
              return (
                <button
                  key={c.id}
                  className="campaign-chip"
                  style={{ width: '100%', justifyContent: 'space-between' }}
                  onClick={() => onSelectCampaign(c)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span className={`chip-dot ${c.status || 'draft'}`} />
                    <span className="chip-name">{c.campaign_name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                    {platformList.map((p, i) => (
                      <span key={i} className="badge badge-muted">{p}</span>
                    ))}
                    {(c.start_date || c.end_date) && (
                      <span className="chip-date">
                        {formatDate(c.start_date)}{c.end_date ? ` — ${formatDate(c.end_date)}` : ''}
                      </span>
                    )}
                    {c.budget > 0 && <span className="chip-budget">{formatMoney(c.budget)}</span>}
                    <span className="badge badge-muted">{entries.length} entries</span>
                    {liveCount > 0 && (
                      <span className="badge badge-success">{liveCount} live</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
