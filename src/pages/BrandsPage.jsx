import { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import BrandList from './brands/BrandList';
import CampaignSummary from './brands/CampaignSummary';
import EntryTables from './brands/EntryTables';
import EntryDetail from './brands/EntryDetail';

// ─── Metric helpers ────────────────────────────────────────
const PLATFORM_LABELS = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  twitter: 'Twitter',
  custom: 'Other',
};

// Parse values like "34%", "34.5", "" → number. Empty strings become null
// so they don't distort the weighted averages.
function parsePct(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = parseFloat(s.replace('%', ''));
  return Number.isFinite(n) ? n : null;
}

/** Compute campaign-level roll-ups from the grouped entries map returned by
 *  BrandsPage.loadEntries. Returns null for genuinely-empty campaigns so the
 *  UI can show the empty state. */
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

  // Weighted average engagement rate, by views.
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

  // Content Formats: platform × deliverable_type → quantity
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

  // Demographics: weighted average age buckets + gender, frequency-ranked cities.
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

/**
 * Brand Management — 4-level drill-down:
 *   Level 1: Brand cards with FY-grouped campaigns
 *   Level 2: Campaign summary dashboard (aggregated metrics)
 *   Level 3: Platform-specific entry tables (Instagram, YouTube, etc.)
 *   Level 4: Expanded entry detail (demographics, caption, comments, transcript)
 */
export default function BrandsPage() {
  const [level, setLevel] = useState(1);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [entries, setEntries] = useState({});

  // Fetch partnerships from API
  const loadBrands = useCallback(async () => {
    try {
      const data = await api.get('/api/partnerships');
      // Map PoC fields into the brand_poc array BrandList expects
      const mapped = (data || []).map((b) => ({
        ...b,
        brand_poc: [b.brand_poc_1, b.brand_poc_2, b.brand_poc_3].filter(Boolean),
      }));
      setBrands(mapped);
    } catch (err) {
      console.error('Failed to load brands:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBrands(); }, [loadBrands]);

  // Fetch campaigns for a specific partnership
  const loadCampaigns = useCallback(async (partnershipId) => {
    try {
      const data = await api.get(`/api/partnerships/${partnershipId}/campaigns`);
      setCampaigns(data || []);
      return data || [];
    } catch (err) {
      console.error('Failed to load campaigns:', err);
      return [];
    }
  }, []);

  // Fetch entries for a specific campaign. Server returns a flat list; the
  // EntryTables component consumes a map keyed by platform, so we group here.
  const loadEntries = useCallback(async (campaignId) => {
    try {
      const data = await api.get(`/api/campaigns/${campaignId}/entries`);
      const list = Array.isArray(data) ? data : [];
      const grouped = { instagram: [], youtube: [], linkedin: [], twitter: [], custom: [] };
      for (const e of list) {
        const key = (e?.platform || 'instagram').toLowerCase();
        (grouped[key] || grouped.custom).push(e);
      }
      setEntries(grouped);
      return grouped;
    } catch (err) {
      console.error('Failed to load entries:', err);
      setEntries({});
      return {};
    }
  }, []);

  const drillToCampaign = async (brand, campaign) => {
    setSelectedBrand(brand);
    setSelectedCampaign(campaign);
    await loadEntries(campaign.id);
    setLevel(2);
  };

  const drillToEntries = () => setLevel(3);

  const drillToDetail = (entry, platform) => {
    setSelectedEntry(entry);
    setSelectedPlatform(platform);
    setLevel(4);
  };

  const goBack = (toLevel) => {
    setLevel(toLevel);
    if (toLevel <= 3) setSelectedEntry(null);
    if (toLevel <= 1) {
      setSelectedCampaign(null);
      setSelectedBrand(null);
      loadBrands(); // Refresh list
    }
  };

  const metrics = computeCampaignMetrics(entries);

  if (loading) {
    return (
      <div className="page-container" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
        Loading brands…
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <button className={`breadcrumb-item${level === 1 ? ' active' : ''}`} onClick={() => goBack(1)}>
          Brands
        </button>
        {level >= 2 && (
          <>
            <span className="breadcrumb-sep">›</span>
            <button className={`breadcrumb-item${level === 2 ? ' active' : ''}`} onClick={() => goBack(2)}>
              {selectedBrand?.brand_name}
            </button>
          </>
        )}
        {level >= 3 && (
          <>
            <span className="breadcrumb-sep">›</span>
            <button className={`breadcrumb-item${level === 3 ? ' active' : ''}`} onClick={() => goBack(3)}>
              {selectedCampaign?.campaign_name}
            </button>
          </>
        )}
        {level === 4 && (
          <>
            <span className="breadcrumb-sep">›</span>
            <span className="breadcrumb-item active">
              {selectedEntry?.creator_name || `@${selectedEntry?.creator_username || ''}`}
            </span>
          </>
        )}
      </div>

      {level === 1 && (
        <BrandList brands={brands} onSelectCampaign={drillToCampaign} onRefresh={loadBrands} />
      )}

      {level === 2 && selectedCampaign && (
        <CampaignSummary
          brand={selectedBrand}
          campaign={selectedCampaign}
          metrics={metrics}
          onViewEntries={drillToEntries}
          onRefreshEntries={() => loadEntries(selectedCampaign.id)}
        />
      )}

      {level === 3 && entries && (
        <EntryTables
          campaign={selectedCampaign}
          entries={entries}
          onSelectEntry={drillToDetail}
        />
      )}

      {level === 4 && selectedEntry && (
        <EntryDetail entry={selectedEntry} platform={selectedPlatform} />
      )}
    </div>
  );
}
