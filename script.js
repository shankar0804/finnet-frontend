// ═══ TRAKR Frontend — All API calls go to the Render backend ═══
const API_BASE = 'https://finnet-backend.onrender.com';

document.addEventListener('DOMContentLoaded', () => {

    const navBtns = document.querySelectorAll('.nav-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            navBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });

    let roster = [];
    const tbody = document.getElementById('roster-tbody');
    const filterFollowers = document.getElementById('filter-followers');
    const filterViews = document.getElementById('filter-views');
    const filterEngagement = document.getElementById('filter-engagement');
    const addBtn = document.getElementById('add-influencer-btn');
    const newUsernameInput = document.getElementById('new-ig-username');

    const formatNumber = (num) => {
        if (num === '' || num === undefined || num === null) return '-';
        if (typeof num !== 'number') return num;
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toLocaleString();
    };
    const renderEmpty = (val) => (val === '' || val === null || val === undefined) ? '<span style="color:var(--border);">-</span>' : val;
    const formatTimestamp = (ts) => {
        if (!ts) return '<span style="color:var(--border);">-</span>';
        try { return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }); } catch (e) { return ts; }
    };
    const formatDuration = (secs) => {
        if (!secs || secs === 0) return '<span style="color:var(--border);">-</span>';
        const m = Math.floor(secs / 60), s = secs % 60;
        return m > 0 ? `${m}m ${s}s` : `${s}s`;
    };

    const renderRoster = () => {
        const minFol = parseInt(filterFollowers.value), minViews = parseInt(filterViews.value), minEng = parseFloat(filterEngagement.value);
        const filtered = roster.filter(r => r.followers >= minFol && r.avg_views >= minViews && r.engagement_rate >= minEng);
        tbody.innerHTML = '';
        if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="32" style="text-align:center;color:var(--text-secondary);padding:40px;">No creators match filters or DB is empty.</td></tr>'; return; }
        filtered.forEach((r) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight:600;color:var(--accent);">@${r.username}</td>
                <td style="font-weight:500;">${r.creator_name}</td>
                <td><a href="${r.profile_link}" target="_blank" class="action-link">Open IG</a></td>
                <td>${renderEmpty(r.platform)}</td><td>${renderEmpty(r.niche)}</td><td>${renderEmpty(r.language)}</td><td>${renderEmpty(r.location)}</td>
                <td>${formatNumber(r.followers)}</td><td style="font-weight:600;">${formatNumber(r.avg_views)}</td>
                <td style="color:var(--success);font-weight:600;">${r.engagement_rate}%</td>
                <td>${formatDuration(r.avg_video_length)}</td>
                <td style="color:var(--accent);font-weight:bold;">${renderEmpty(r.avd)}</td>
                <td style="color:var(--accent);font-weight:bold;">${renderEmpty(r.skip_rate)}</td>
                <td>${renderEmpty(r.age_13_17)}</td><td>${renderEmpty(r.age_18_24)}</td><td>${renderEmpty(r.age_25_34)}</td>
                <td>${renderEmpty(r.age_35_44)}</td><td>${renderEmpty(r.age_45_54)}</td>
                <td>${renderEmpty(r.male_pct)}</td><td>${renderEmpty(r.female_pct)}</td>
                <td>${renderEmpty(r.city_1)}</td><td>${renderEmpty(r.city_2)}</td><td>${renderEmpty(r.city_3)}</td>
                <td>${renderEmpty(r.city_4)}</td><td>${renderEmpty(r.city_5)}</td>
                <td>${renderEmpty(r.contact_numbers)}</td><td>${renderEmpty(r.mail_id)}</td><td>${renderEmpty(r.managed_by)}</td>
                <td style="font-size:0.75rem;">${formatTimestamp(r.last_scraped_at)}</td>
                <td style="font-size:0.75rem;">${formatTimestamp(r.last_ocr_at)}</td>
                <td style="font-size:0.75rem;">${formatTimestamp(r.last_manual_at)}</td>
                <td><button class="text-btn" style="color:var(--danger);font-size:0.8rem;" onclick="deleteUser('${r.username}')">Delete</button></td>`;
            tbody.appendChild(tr);
        });
    };

    const renderSkeleton = () => {
        tbody.innerHTML = '';
        for (let i = 0; i < 5; i++) {
            const tr = document.createElement('tr');
            let cells = '';
            for (let c = 0; c < 32; c++) cells += '<td><div class="skeleton" style="width:70px;height:16px;"></div></td>';
            tr.innerHTML = cells; tbody.appendChild(tr);
        }
    };

    const fetchRosterData = async () => {
        renderSkeleton();
        try {
            const res = await fetch(`${API_BASE}/api/roster`);
            if (res.ok) { roster = await res.json(); renderRoster(); }
        } catch (e) {
            console.error("Failed to load roster", e);
            tbody.innerHTML = '<tr><td colspan="32" style="text-align:center;color:var(--danger);padding:40px;">Connection Interrupted.</td></tr>';
        }
    };

    window.deleteUser = async (username) => {
        if (!confirm(`Delete @${username}?`)) return;
        try { const res = await fetch(`${API_BASE}/api/roster/${username}`, { method: 'DELETE' }); if (res.ok) fetchRosterData(); } catch (e) { alert("Deletion failed"); }
    };

    filterFollowers.addEventListener('change', renderRoster);
    filterViews.addEventListener('change', renderRoster);
    filterEngagement.addEventListener('change', renderRoster);

    addBtn.addEventListener('click', async () => {
        const uname = newUsernameInput.value.trim();
        if (!uname) return;
        addBtn.disabled = true; addBtn.innerText = 'Scraping...';
        try {
            const res = await fetch(`${API_BASE}/api/scrape-instagram`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: uname }) });
            const data = await res.json();
            if (!res.ok) alert(data.error || "Failed"); else { newUsernameInput.value = ''; await fetchRosterData(); }
        } catch (e) { alert("Network error."); }
        finally { addBtn.disabled = false; addBtn.innerText = 'Fetch Data & Add'; }
    });

    fetchRosterData();

    // --- OCR ---
    const dropZone = document.getElementById('upload-zone'), fileInput = document.getElementById('file-input');
    const browseBtn = document.getElementById('browse-btn'), previewContainer = document.getElementById('preview-container');
    const thumbnails = document.getElementById('thumbnails'), fileCount = document.getElementById('file-count');
    const clearFilesBtn = document.getElementById('clear-files-btn'), uploadContent = document.getElementById('upload-content');
    const extractBtn = document.getElementById('extract-btn'), loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text'), ocrIgLink = document.getElementById('ocr-ig-link');
    const errorMsg = document.getElementById('error-message'), resultsSection = document.getElementById('results-section');
    let selectedFiles = [];

    browseBtn.addEventListener('click', (e) => { e.preventDefault(); fileInput.click(); });
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); handleFiles(Array.from(e.dataTransfer.files)); });
    fileInput.addEventListener('change', () => { if (fileInput.files.length) handleFiles(Array.from(fileInput.files)); });
    clearFilesBtn.addEventListener('click', () => { selectedFiles = []; thumbnails.innerHTML = ''; fileCount.textContent = ''; previewContainer.classList.add('hidden'); uploadContent.classList.remove('hidden'); fileInput.value = ''; checkFormValidity(); });

    function handleFiles(files) {
        const imgs = files.filter(f => f.type.startsWith('image/'));
        if (!imgs.length) { showOcrError("Upload image files."); return; }
        selectedFiles = [...selectedFiles, ...imgs]; errorMsg.classList.add('hidden'); resultsSection.classList.add('hidden'); renderThumbnails();
    }
    function renderThumbnails() {
        thumbnails.innerHTML = '';
        selectedFiles.forEach((file, i) => { const reader = new FileReader(); reader.onload = (e) => { const img = document.createElement('img'); img.src = e.target.result; img.style.cssText = 'width:80px;height:80px;object-fit:cover;border-radius:8px;border:2px solid var(--border);'; img.id = `thumb-${i}`; thumbnails.appendChild(img); }; reader.readAsDataURL(file); });
        fileCount.textContent = `${selectedFiles.length} screenshot${selectedFiles.length > 1 ? 's' : ''} selected`;
        uploadContent.classList.add('hidden'); previewContainer.classList.remove('hidden'); checkFormValidity();
    }
    function checkFormValidity() { extractBtn.disabled = !(selectedFiles.length > 0 && ocrIgLink.value.trim().length > 0); }
    ocrIgLink.addEventListener('input', checkFormValidity);
    function showOcrError(msg) { errorMsg.textContent = msg; errorMsg.classList.remove('hidden'); loadingOverlay.classList.add('hidden'); checkFormValidity(); }

    extractBtn.addEventListener('click', async () => {
        if (!selectedFiles.length || !ocrIgLink.value.trim()) return;
        errorMsg.classList.add('hidden'); resultsSection.classList.add('hidden'); extractBtn.disabled = true; loadingOverlay.classList.remove('hidden');
        const target = ocrIgLink.value.trim(); let mergedResult = {}, successCount = 0;
        for (let i = 0; i < selectedFiles.length; i++) {
            loadingText.textContent = `Processing screenshot ${i + 1} of ${selectedFiles.length}...`;
            const thumb = document.getElementById(`thumb-${i}`); if (thumb) thumb.style.border = '2px solid var(--accent)';
            const formData = new FormData(); formData.append('image', selectedFiles[i]); formData.append('target_username', target);
            try {
                const req = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData });
                const data = await req.json();
                if (req.ok && data.result) { successCount++; Object.entries(data.result).forEach(([k, v]) => { if (v && v !== '-' && v !== 'N/A' && v !== '') mergedResult[k] = v; }); if (thumb) thumb.style.border = '2px solid var(--success)'; }
                else { if (thumb) thumb.style.border = '2px solid var(--danger)'; }
            } catch (err) { if (thumb) thumb.style.border = '2px solid var(--danger)'; }
        }
        loadingOverlay.classList.add('hidden'); extractBtn.disabled = false;
        if (successCount === 0) { showOcrError("All screenshots failed."); return; }
        resultsSection.classList.remove('hidden');
        document.getElementById('val-engaged').textContent = mergedResult.engaged_views || '-';
        document.getElementById('val-unique').textContent = mergedResult.unique_viewers || '-';
        document.getElementById('val-avg').textContent = mergedResult.average_view_duration || '-';
        document.getElementById('val-watch').textContent = mergedResult.watch_time_hours || mergedResult.watch_time || '-';
        await fetchRosterData();
    });

    // --- AI Search ---
    const searchInput = document.getElementById('ai-search-input'), searchBtn = document.getElementById('ai-search-btn');
    const searchLoading = document.getElementById('ai-search-loading'), searchOutput = document.getElementById('ai-search-output');
    const searchInsight = document.getElementById('ai-search-insight'), insightText = document.getElementById('ai-insight-text');
    const searchEmpty = document.getElementById('ai-search-empty'), searchError = document.getElementById('ai-search-error');
    const resultThead = document.getElementById('ai-result-thead'), resultTbody = document.getElementById('ai-result-tbody');
    const exportBtn = document.getElementById('export-to-sheet-btn'), exportSheetLink = document.getElementById('export-sheet-link'), exportSheetUrl = document.getElementById('export-sheet-url');
    let lastSearchData = null;
    if (!searchBtn || !searchInput) return;

    const hideAll = () => { [searchOutput, searchInsight, searchEmpty, searchError, exportSheetLink].forEach(el => { if (el) el.classList.add('hidden'); }); lastSearchData = null; };

    searchBtn.addEventListener('click', async () => {
        const query = searchInput.value.trim(); if (!query) return;
        searchBtn.disabled = true; hideAll(); searchLoading.classList.remove('hidden');
        try {
            const res = await fetch(`${API_BASE}/api/custom-search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
            const data = await res.json(); searchLoading.classList.add('hidden'); searchBtn.disabled = false;
            if (!res.ok) { searchError.textContent = data.details || data.error || 'Failed'; searchError.classList.remove('hidden'); return; }
            const ans = data.answer;
            if (ans?.type === 'error') { searchError.textContent = ans.message; searchError.classList.remove('hidden'); return; }
            if (ans?.type === 'data') {
                if (ans.insight) { insightText.innerHTML = ans.insight; searchInsight.classList.remove('hidden'); }
                if (!ans.data?.length) { searchEmpty.classList.remove('hidden'); return; }
                lastSearchData = ans.data;
                const cols = Object.keys(ans.data[0]);
                resultThead.innerHTML = `<tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr>`;
                resultTbody.innerHTML = ans.data.map(row => `<tr>${cols.map(c => `<td>${row[c] ?? '-'}</td>`).join('')}</tr>`).join('');
                searchOutput.classList.remove('hidden');
            } else { searchError.innerHTML = typeof ans === 'string' ? ans : JSON.stringify(ans); searchError.classList.remove('hidden'); }
        } catch (e) { searchLoading.classList.add('hidden'); searchBtn.disabled = false; searchError.textContent = 'Network Error'; searchError.classList.remove('hidden'); }
    });
    searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') searchBtn.click(); });

    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            if (!lastSearchData?.length) { alert('Run a query first.'); return; }
            exportBtn.disabled = true; exportBtn.textContent = '⏳ Exporting...'; if (exportSheetLink) exportSheetLink.classList.add('hidden');
            try {
                const res = await fetch(`${API_BASE}/api/export-to-sheet`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: lastSearchData, title: `TRAKR Export — ${new Date().toLocaleDateString('en-IN')}` }) });
                const result = await res.json();
                if (!res.ok) alert(result.details || result.error || 'Failed');
                else { exportSheetUrl.href = result.sheet_url; exportSheetLink.classList.remove('hidden'); }
            } catch (e) { alert('Export failed'); }
            finally { exportBtn.disabled = false; exportBtn.textContent = '📊 Export to Sheets'; }
        });
    }
});
