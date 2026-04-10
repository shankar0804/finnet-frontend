// ═══ TRAKR Frontend — All API calls go to the Render backend ═══
const API_BASE = 'https://finnet-backend.onrender.com';
const ALLOWED_DOMAIN = 'finnetmedia.com';

// ─── JWT Token Helper ───
function getToken() { return sessionStorage.getItem('trakr_token') || ''; }
function authHeaders(extra = {}) {
    const token = getToken();
    const headers = { ...extra };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

// ─── Copy / Select Protection (keyboard shortcuts) ───
document.addEventListener('keydown', (e) => {
    // Block Ctrl+C, Ctrl+X, Ctrl+A, Ctrl+U, Ctrl+S, Ctrl+P
    if (e.ctrlKey && ['c','x','a','u','s','p'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        return false;
    }
    // Block F12 / Ctrl+Shift+I (dev tools) — optional, remove if annoying during dev
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'i')) {
        e.preventDefault();
        return false;
    }
});

// ─── Google Sign-In Callback (must be global) ───
function handleGoogleSignIn(response) {
    try {
        // Decode JWT payload (base64url → JSON)
        const payload = JSON.parse(atob(response.credential.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
        const email = payload.email || '';
        const domain = email.split('@')[1] || '';

        if (domain.toLowerCase() !== ALLOWED_DOMAIN) {
            const errEl = document.getElementById('login-error');
            errEl.textContent = `Access denied. "${email}" is not a @${ALLOWED_DOMAIN} account.`;
            errEl.classList.remove('hidden');
            return;
        }

        // Register with backend to get role
        fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: payload.email,
                name: payload.name || payload.email.split('@')[0],
                picture: payload.picture || ''
            })
        })
        .then(r => r.json())
        .then(data => {
            if (data.error) {
                const errEl = document.getElementById('login-error');
                errEl.textContent = data.error;
                errEl.classList.remove('hidden');
                return;
            }

            const userObj = {
                email: payload.email,
                name: payload.name || payload.email.split('@')[0],
                picture: payload.picture || '',
                role: data.role || 'junior',
                exp: payload.exp
            };
            // Store JWT token from backend
            if (data.token) sessionStorage.setItem('trakr_token', data.token);
            sessionStorage.setItem('trakr_user', JSON.stringify(userObj));
            unlockDashboard(userObj);
            // Reload roster with correct role
            if (window._fetchRosterData) window._fetchRosterData();
            // Load team tab if admin
            if (userObj.role === 'admin' && window._loadTeam) window._loadTeam();
        })
        .catch(err => {
            console.error('Backend login error:', err);
            // Still allow access with junior role as fallback
            const userObj = {
                email: payload.email,
                name: payload.name || payload.email.split('@')[0],
                picture: payload.picture || '',
                role: 'junior',
                exp: payload.exp
            };
            sessionStorage.setItem('trakr_user', JSON.stringify(userObj));
            unlockDashboard(userObj);
        });

    } catch (err) {
        console.error('Sign-in error:', err);
        const errEl = document.getElementById('login-error');
        errEl.textContent = 'Sign-in failed. Please try again.';
        errEl.classList.remove('hidden');
    }
}

// ─── Password Login Handler ───
async function handlePasswordLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    const btn = document.getElementById('login-password-btn');

    errEl.classList.add('hidden');

    if (!email || !password) {
        errEl.textContent = 'Please enter email and password.';
        errEl.classList.remove('hidden');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Signing in...';

    try {
        const res = await fetch(`${API_BASE}/api/auth/login-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (!res.ok) {
            errEl.textContent = data.error || 'Login failed';
            errEl.classList.remove('hidden');
            return;
        }

        const userObj = {
            email: data.email,
            name: data.name || data.email.split('@')[0],
            picture: '',
            role: data.role || 'junior',
        };
        if (data.token) sessionStorage.setItem('trakr_token', data.token);
        sessionStorage.setItem('trakr_user', JSON.stringify(userObj));
        unlockDashboard(userObj);
        if (window._fetchRosterData) window._fetchRosterData();
        if (userObj.role === 'admin' && window._loadTeam) window._loadTeam();
    } catch (e) {
        errEl.textContent = 'Network error. Try again.';
        errEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Sign In';
    }
}

// ─── Login Flow Navigation ───
document.addEventListener('DOMContentLoaded', () => {
    const selector = document.getElementById('login-selector');
    const googleSection = document.getElementById('login-google-section');
    const pwdSection = document.getElementById('login-password-section');
    const errEl = document.getElementById('login-error');

    const showSection = (show) => {
        [selector, googleSection, pwdSection].forEach(s => { if (s) s.classList.add('hidden'); });
        if (errEl) errEl.classList.add('hidden');
        if (show) show.classList.remove('hidden');
    };

    // Role selector buttons
    const brandBtn = document.getElementById('select-brand-login');
    const internalBtn = document.getElementById('select-internal-login');
    if (brandBtn) brandBtn.addEventListener('click', () => showSection(pwdSection));
    if (internalBtn) internalBtn.addEventListener('click', () => showSection(googleSection));

    // Back buttons
    const backPwd = document.getElementById('back-from-password');
    const backGoogle = document.getElementById('back-from-google');
    if (backPwd) backPwd.addEventListener('click', () => showSection(selector));
    if (backGoogle) backGoogle.addEventListener('click', () => showSection(selector));

    // Show selector by default
    if (selector) selector.classList.remove('hidden');

    // Password login handlers
    const loginBtn = document.getElementById('login-password-btn');
    if (loginBtn) loginBtn.addEventListener('click', handlePasswordLogin);
    const loginPwdInput = document.getElementById('login-password');
    if (loginPwdInput) loginPwdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handlePasswordLogin(); });
});

function unlockDashboard(user) {
    document.getElementById('login-overlay').classList.add('hidden');
    // Show user profile in navbar
    const profileEl = document.getElementById('user-profile');
    const avatarEl = document.getElementById('user-avatar');
    const nameEl = document.getElementById('user-name');
    if (profileEl && nameEl) {
        nameEl.textContent = user.name || user.email;
        if (avatarEl && user.picture) { avatarEl.src = user.picture; }
        else if (avatarEl) { avatarEl.style.display = 'none'; }
        profileEl.classList.remove('hidden');
    }

    const role = user.role || 'junior';
    window._userRole = role;
    window._userEmail = user.email;

    if (role === 'brand') {
        // Brand users: hide all internal tabs, show only Brand Portal
        document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
            btn.classList.add('hidden');
        });
        const brandBtn = document.getElementById('nav-brand-btn');
        if (brandBtn) {
            brandBtn.classList.remove('hidden');
            brandBtn.click(); // Auto-switch to brand tab
        }
    } else {
        // Internal users: show Team + Brand Mgmt tabs for admin/senior
        if (role === 'admin' || role === 'senior') {
            const teamBtn = document.getElementById('nav-team-btn');
            if (teamBtn) teamBtn.classList.remove('hidden');
            const bmBtn = document.getElementById('nav-brand-mgmt-btn');
            if (bmBtn) bmBtn.classList.remove('hidden');
        }
    }
}

function signOut() {
    sessionStorage.removeItem('trakr_user');
    sessionStorage.removeItem('trakr_token');
    if (window.google?.accounts?.id) {
        google.accounts.id.disableAutoSelect();
    }
    location.reload();
}

document.addEventListener('DOMContentLoaded', () => {

    // ─── Session Check: auto-unlock if already signed in ───
    const stored = sessionStorage.getItem('trakr_user');
    if (stored) {
        try {
            const user = JSON.parse(stored);
            // Check if token hasn't expired (exp is in seconds)
            if (user.exp && (user.exp * 1000) > Date.now()) {
                unlockDashboard(user);
            } else {
                sessionStorage.removeItem('trakr_user');
            }
        } catch (e) {
            sessionStorage.removeItem('trakr_user');
        }
    }

    // ─── Sign-out button ───
    const signOutBtn = document.getElementById('sign-out-btn');
    if (signOutBtn) signOutBtn.addEventListener('click', signOut);


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
            const res = await fetch(`${API_BASE}/api/roster`, { headers: authHeaders() });
            if (res.ok) { roster = await res.json(); renderRoster(); }
        } catch (e) {
            console.error("Failed to load roster", e);
            tbody.innerHTML = '<tr><td colspan="32" style="text-align:center;color:var(--danger);padding:40px;">Connection Interrupted.</td></tr>';
        }
    };
    window._fetchRosterData = fetchRosterData;

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

    // ─── Team Management (Admin / Senior) ───
    const teamTbody = document.getElementById('team-tbody');
    const roleSelect = document.getElementById('new-user-role');
    const pwdInput = document.getElementById('new-user-password');
    const hintEl = document.getElementById('create-user-hint');

    // Customize form based on role
    if (window._userRole === 'senior') {
        // Senior: can only add brand accounts → hide role dropdown, require password
        if (roleSelect) roleSelect.style.display = 'none';
        if (hintEl) hintEl.textContent = 'Enter brand email + password to create a brand account.';
    } else if (window._userRole === 'admin') {
        if (hintEl) hintEl.textContent = 'Password empty = Google (internal). Password filled = Brand account.';
    }

    const formatDate = (ts) => {
        if (!ts) return '-';
        try { return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }); } catch { return '-'; }
    };

    const loadTeam = async () => {
        if (!['admin','senior'].includes(window._userRole) || !teamTbody) return;
        teamTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">Loading team...</td></tr>';
        try {
            const res = await fetch(`${API_BASE}/api/users`, { headers: authHeaders() });
            if (!res.ok) { teamTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--danger);padding:24px;">Failed to load team.</td></tr>'; return; }
            const users = await res.json();
            teamTbody.innerHTML = '';
            if (!users.length) { teamTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">No team members yet.</td></tr>'; return; }

            users.forEach(u => {
                const tr = document.createElement('tr');
                const isAdmin = u.role === 'admin';
                const isSenior = u.role === 'senior';
                const isBrand = u.role === 'brand';
                const roleBadgeClass = isAdmin ? 'role-admin' : isSenior ? 'role-senior' : isBrand ? 'role-brand' : 'role-junior';
                const authMethod = u.auth_method || 'google';
                const authBadge = authMethod === 'password'
                    ? '<span class="auth-badge auth-password">Password</span>'
                    : '<span class="auth-badge auth-google">Google</span>';

                let actionHtml = '';
                if (isAdmin || isBrand) {
                    actionHtml = '<span style="color:var(--text-muted);font-size:0.8rem;">—</span>';
                } else if (isSenior) {
                    actionHtml = `<button class="role-toggle-btn demote" onclick="window._toggleRole('${u.email}', 'junior')">Demote to Junior</button>`;
                } else {
                    actionHtml = `<button class="role-toggle-btn promote" onclick="window._toggleRole('${u.email}', 'senior')">Promote to Senior</button>`;
                }

                tr.innerHTML = `
                    <td><div class="team-user-cell">${u.picture ? `<img src="${u.picture}" alt="">` : ''}<span>${u.name || u.email.split('@')[0]}</span></div></td>
                    <td>${u.email}</td>
                    <td><span class="role-badge ${roleBadgeClass}">${u.role}</span></td>
                    <td>${authBadge}</td>
                    <td style="font-size:0.8rem;">${formatDate(u.created_at)}</td>
                    <td>${actionHtml}</td>`;
                teamTbody.appendChild(tr);
            });
        } catch (e) {
            console.error('Failed to load team:', e);
            teamTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--danger);padding:24px;">Network error.</td></tr>';
        }
    };
    window._loadTeam = loadTeam;

    // ─── Create User (Admin: any, Senior: brand only) ───
    const createUserBtn = document.getElementById('create-user-btn');
    if (createUserBtn) {
        createUserBtn.addEventListener('click', async () => {
            const email = document.getElementById('new-user-email').value.trim();
            const password = document.getElementById('new-user-password').value;
            const role = document.getElementById('new-user-role').value;
            const errEl = document.getElementById('create-user-error');
            errEl.classList.add('hidden');

            if (!email) {
                errEl.textContent = 'Email is required.';
                errEl.classList.remove('hidden');
                return;
            }
            if (password && password.length < 6) {
                errEl.textContent = 'Password must be at least 6 characters.';
                errEl.classList.remove('hidden');
                return;
            }

            createUserBtn.disabled = true;
            createUserBtn.textContent = 'Creating...';

            try {
                const body = { email, role };
                if (password) body.password = password;

                const res = await fetch(`${API_BASE}/api/users/create`, {
                    method: 'POST',
                    headers: authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify(body)
                });
                const data = await res.json();
                if (!res.ok) {
                    errEl.textContent = data.error || 'Failed to create user';
                    errEl.classList.remove('hidden');
                } else {
                    document.getElementById('new-user-email').value = '';
                    document.getElementById('new-user-password').value = '';
                    document.getElementById('new-user-role').value = 'junior';
                    await loadTeam();
                }
            } catch (e) {
                errEl.textContent = 'Network error.';
                errEl.classList.remove('hidden');
            } finally {
                createUserBtn.disabled = false;
                createUserBtn.textContent = '+ Add User';
            }
        });
    }

    window._toggleRole = async (email, newRole) => {
        if (!confirm(`Change ${email} to ${newRole}?`)) return;
        try {
            const res = await fetch(`${API_BASE}/api/users/role`, {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ email, role: newRole })
            });
            const data = await res.json();
            if (!res.ok) { alert(data.error || 'Failed'); return; }
            await loadTeam();
            await loadAuditLogs();
        } catch (e) { alert('Network error.'); }
    };

    // ─── Audit Logs (Admin Only) ───
    const auditTbody = document.getElementById('audit-tbody');
    const auditFilterOp = document.getElementById('audit-filter-op');
    const auditRefreshBtn = document.getElementById('audit-refresh-btn');
    let allAuditLogs = [];

    const OP_COLORS = {
        'INSERT': 'var(--success)', 'UPSERT': 'var(--success)',
        'UPDATE': 'var(--accent)', 'DELETE': 'var(--danger)',
        'LOGIN': '#a78bfa', 'EXPORT': '#f59e0b',
        'BULK_IMPORT': '#06b6d4',
    };

    const renderAuditLogs = () => {
        if (!auditTbody) return;
        const filter = auditFilterOp ? auditFilterOp.value : '';
        const filtered = filter ? allAuditLogs.filter(l => l.operation === filter) : allAuditLogs;

        if (!filtered.length) {
            auditTbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted);">No audit logs yet.</td></tr>';
            return;
        }
        auditTbody.innerHTML = '';
        filtered.forEach(log => {
            const tr = document.createElement('tr');
            const opColor = OP_COLORS[log.operation] || 'var(--text-muted)';
            const detailStr = log.details && Object.keys(log.details).length
                ? Object.entries(log.details).map(([k,v]) => `${k}: ${v}`).join(', ')
                : '-';
            const timeStr = log.created_at
                ? new Date(log.created_at).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hour12:false })
                : '-';
            const srcBadge = log.source === 'whatsapp_bot'
                ? '<span style="color:#22c55e;">bot</span>'
                : log.source === 'bulk_import' ? '<span style="color:#06b6d4;">bulk</span>'
                : '<span style="color:var(--text-muted);">dash</span>';

            tr.innerHTML = `
                <td style="font-size:0.75rem;white-space:nowrap;">${timeStr}</td>
                <td><span style="color:${opColor};font-weight:700;font-size:0.72rem;text-transform:uppercase;">${log.operation}</span></td>
                <td style="font-size:0.8rem;">${(log.performed_by || 'system').split('@')[0]}</td>
                <td style="font-size:0.8rem;color:var(--text-muted);">${log.target_table}</td>
                <td style="font-size:0.8rem;font-weight:600;">${log.target_id || '-'}</td>
                <td style="font-size:0.72rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${detailStr}">${detailStr}</td>
                <td>${srcBadge}</td>
                <td style="font-size:0.72rem;color:var(--text-muted);">${log.ip_address || '-'}</td>`;
            auditTbody.appendChild(tr);
        });
    };

    const loadAuditLogs = async () => {
        if (window._userRole !== 'admin' || !auditTbody) return;
        auditTbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted);">Loading audit logs...</td></tr>';
        try {
            const res = await fetch(`${API_BASE}/api/audit-logs?limit=200`, { headers: authHeaders() });
            if (!res.ok) { auditTbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--danger);padding:24px;">Failed to load.</td></tr>'; return; }
            allAuditLogs = await res.json();
            renderAuditLogs();
        } catch (e) {
            console.error('Audit logs error:', e);
            auditTbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--danger);padding:24px;">Network error.</td></tr>';
        }
    };

    if (auditFilterOp) auditFilterOp.addEventListener('change', renderAuditLogs);
    if (auditRefreshBtn) auditRefreshBtn.addEventListener('click', loadAuditLogs);

    // ═══════════════════════════════════════════════════
    // BRAND MANAGEMENT MODULE
    // ═══════════════════════════════════════════════════
    const BM = {
        currentPartnership: null,
        currentCampaign: null,
    };

    const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'2-digit'}) : '—';
    const fmtMoney = n => n ? `₹${Number(n).toLocaleString('en-IN')}` : '—';
    const bmStatus = s => `<span class="bm-status bm-status-${s}">${s.replace('_',' ')}</span>`;

    // ─── Level Navigation ───
    function bmShowLevel(level) {
        document.getElementById('bm-partnerships').classList.toggle('hidden', level !== 'partnerships');
        document.getElementById('bm-campaigns').classList.toggle('hidden', level !== 'campaigns');
        document.getElementById('bm-entries').classList.toggle('hidden', level !== 'entries');
        // Breadcrumbs
        const sep1 = document.getElementById('bm-sep1');
        const sep2 = document.getElementById('bm-sep2');
        const crumbC = document.getElementById('bm-crumb-campaigns');
        const crumbE = document.getElementById('bm-crumb-entries');
        const crumbP = document.getElementById('bm-crumb-partnerships');
        crumbP.classList.toggle('active', level === 'partnerships');
        if (level === 'partnerships') {
            sep1.classList.add('hidden'); crumbC.classList.add('hidden');
            sep2.classList.add('hidden'); crumbE.classList.add('hidden');
        } else if (level === 'campaigns') {
            sep1.classList.remove('hidden'); crumbC.classList.remove('hidden');
            crumbC.classList.add('active');
            sep2.classList.add('hidden'); crumbE.classList.add('hidden');
        } else {
            sep1.classList.remove('hidden'); crumbC.classList.remove('hidden');
            crumbC.classList.remove('active');
            sep2.classList.remove('hidden'); crumbE.classList.remove('hidden');
            crumbE.classList.add('active');
        }
    }

    // Breadcrumb clicks
    document.getElementById('bm-crumb-partnerships')?.addEventListener('click', () => {
        bmShowLevel('partnerships'); bmLoadPartnerships();
    });
    document.getElementById('bm-crumb-campaigns')?.addEventListener('click', () => {
        if (BM.currentPartnership) { bmShowLevel('campaigns'); bmLoadCampaigns(BM.currentPartnership.id); }
    });

    // ─── Partnerships ───
    async function bmLoadPartnerships() {
        const grid = document.getElementById('bm-partnerships-grid');
        grid.innerHTML = '<div class="bm-empty">Loading partnerships...</div>';
        try {
            const res = await fetch(`${API_BASE}/api/partnerships`, {headers: authHeaders()});
            const data = await res.json();
            if (!res.ok) { grid.innerHTML = `<div class="bm-empty">${data.error||'Error'}</div>`; return; }
            if (!data.length) { grid.innerHTML = '<div class="bm-empty">No partnerships yet. Click "+ Add Partnership" to get started.</div>'; return; }
            grid.innerHTML = '';
            data.forEach(p => {
                const card = document.createElement('div');
                card.className = 'bm-card';
                card.innerHTML = `
                    <div class="bm-card-name">${p.brand_name}</div>
                    <div class="bm-card-email">${p.contact_email || 'No contact email'}</div>
                    ${bmStatus(p.status)}
                    <div class="bm-card-footer">
                        <span class="bm-card-count">${p.campaign_count || 0} campaign${p.campaign_count !== 1 ? 's' : ''}</span>
                        <span style="font-size:0.7rem;color:var(--text-muted);">${fmtDate(p.created_at)}</span>
                    </div>`;
                card.addEventListener('click', () => {
                    BM.currentPartnership = p;
                    document.getElementById('bm-crumb-campaigns').textContent = p.brand_name;
                    document.getElementById('bm-campaigns-title').textContent = `Campaigns — ${p.brand_name}`;
                    bmShowLevel('campaigns');
                    bmLoadCampaigns(p.id);
                });
                grid.appendChild(card);
            });
        } catch(e) {
            grid.innerHTML = '<div class="bm-empty">Network error.</div>';
        }
    }

    // Add partnership form
    const addPBtn = document.getElementById('bm-add-partnership-btn');
    const addPForm = document.getElementById('bm-add-partnership-form');
    addPBtn?.addEventListener('click', () => addPForm.classList.toggle('hidden'));
    document.getElementById('bm-p-cancel')?.addEventListener('click', () => addPForm.classList.add('hidden'));
    document.getElementById('bm-p-submit')?.addEventListener('click', async () => {
        const name = document.getElementById('bm-p-name').value.trim();
        const errEl = document.getElementById('bm-p-error');
        errEl.classList.add('hidden');
        if (!name) { errEl.textContent = 'Brand name is required.'; errEl.classList.remove('hidden'); return; }
        try {
            const res = await fetch(`${API_BASE}/api/partnerships`, {
                method: 'POST', headers: authHeaders({'Content-Type':'application/json'}),
                body: JSON.stringify({
                    brand_name: name,
                    contact_email: document.getElementById('bm-p-email').value.trim(),
                    status: document.getElementById('bm-p-status').value,
                    notes: document.getElementById('bm-p-notes').value.trim(),
                })
            });
            if (!res.ok) { const d=await res.json(); errEl.textContent=d.error||'Error'; errEl.classList.remove('hidden'); return; }
            addPForm.classList.add('hidden');
            document.getElementById('bm-p-name').value = '';
            document.getElementById('bm-p-email').value = '';
            document.getElementById('bm-p-notes').value = '';
            bmLoadPartnerships();
        } catch { errEl.textContent='Network error.'; errEl.classList.remove('hidden'); }
    });

    // ─── Campaigns ───
    async function bmLoadCampaigns(pid) {
        const tbody = document.getElementById('bm-campaigns-tbody');
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">Loading...</td></tr>';
        try {
            const res = await fetch(`${API_BASE}/api/partnerships/${pid}/campaigns`, {headers: authHeaders()});
            const data = await res.json();
            if (!res.ok) { tbody.innerHTML = `<tr><td colspan="7" class="bm-empty">${data.error||'Error'}</td></tr>`; return; }
            if (!data.length) { tbody.innerHTML = '<tr><td colspan="7" class="bm-empty">No campaigns yet.</td></tr>'; return; }
            tbody.innerHTML = '';
            data.forEach(c => {
                const tr = document.createElement('tr');
                tr.style.cursor = 'pointer';
                const dates = `${fmtDate(c.start_date)} — ${fmtDate(c.end_date)}`;
                tr.innerHTML = `
                    <td><strong>${c.campaign_name}</strong></td>
                    <td>${c.platform}</td>
                    <td>${bmStatus(c.status)}</td>
                    <td style="font-size:0.8rem;">${dates}</td>
                    <td>${fmtMoney(c.budget)}</td>
                    <td>${c.entry_count || 0}</td>
                    <td><button class="bm-add-btn" style="font-size:0.7rem;padding:4px 10px;" onclick="event.stopPropagation();">View →</button></td>`;
                tr.addEventListener('click', () => {
                    BM.currentCampaign = c;
                    document.getElementById('bm-crumb-entries').textContent = c.campaign_name;
                    document.getElementById('bm-entries-title').textContent = `Entries — ${c.campaign_name}`;
                    bmShowLevel('entries');
                    bmLoadEntries(c.id);
                });
                tbody.appendChild(tr);
            });
        } catch { tbody.innerHTML = '<tr><td colspan="7" class="bm-empty">Network error.</td></tr>'; }
    }

    // Add campaign form
    const addCBtn = document.getElementById('bm-add-campaign-btn');
    const addCForm = document.getElementById('bm-add-campaign-form');
    addCBtn?.addEventListener('click', () => addCForm.classList.toggle('hidden'));
    document.getElementById('bm-c-cancel')?.addEventListener('click', () => addCForm.classList.add('hidden'));
    document.getElementById('bm-c-submit')?.addEventListener('click', async () => {
        const name = document.getElementById('bm-c-name').value.trim();
        const errEl = document.getElementById('bm-c-error');
        errEl.classList.add('hidden');
        if (!name) { errEl.textContent = 'Campaign name required.'; errEl.classList.remove('hidden'); return; }
        try {
            const res = await fetch(`${API_BASE}/api/campaigns`, {
                method: 'POST', headers: authHeaders({'Content-Type':'application/json'}),
                body: JSON.stringify({
                    partnership_id: BM.currentPartnership.id,
                    campaign_name: name,
                    platform: document.getElementById('bm-c-platform').value,
                    start_date: document.getElementById('bm-c-start').value || null,
                    end_date: document.getElementById('bm-c-end').value || null,
                    budget: parseFloat(document.getElementById('bm-c-budget').value) || 0,
                })
            });
            if (!res.ok) { const d=await res.json(); errEl.textContent=d.error||'Error'; errEl.classList.remove('hidden'); return; }
            addCForm.classList.add('hidden');
            document.getElementById('bm-c-name').value='';
            document.getElementById('bm-c-budget').value='';
            bmLoadCampaigns(BM.currentPartnership.id);
        } catch { errEl.textContent='Network error.'; errEl.classList.remove('hidden'); }
    });

    // ─── Entries ───
    async function bmLoadEntries(cid) {
        const tbody = document.getElementById('bm-entries-tbody');
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted);">Loading...</td></tr>';
        try {
            const res = await fetch(`${API_BASE}/api/campaigns/${cid}/entries`, {headers: authHeaders()});
            const data = await res.json();
            if (!res.ok) { tbody.innerHTML = `<tr><td colspan="8" class="bm-empty">${data.error||'Error'}</td></tr>`; return; }
            if (!data.length) { tbody.innerHTML = '<tr><td colspan="8" class="bm-empty">No entries yet.</td></tr>'; return; }
            tbody.innerHTML = '';
            data.forEach(e => {
                const tr = document.createElement('tr');
                const creatorDisplay = e.creator_name
                    ? `<strong>${e.creator_username}</strong><br><span style="font-size:0.7rem;color:var(--text-muted);">${e.creator_name} · ${Number(e.followers||0).toLocaleString()} followers</span>`
                    : `<strong>${e.creator_username}</strong>`;
                const linkHtml = e.content_link ? `<a href="${e.content_link}" target="_blank" style="color:var(--accent);font-size:0.8rem;">View ↗</a>` : '—';
                const statusSelect = `<select class="filter-select" style="font-size:0.75rem;padding:4px 6px;" onchange="window._bmUpdateEntryStatus('${e.id}','${cid}',this.value)">
                    <option value="pending" ${e.status==='pending'?'selected':''}>Pending</option>
                    <option value="in_progress" ${e.status==='in_progress'?'selected':''}>In Progress</option>
                    <option value="delivered" ${e.status==='delivered'?'selected':''}>Delivered</option>
                    <option value="approved" ${e.status==='approved'?'selected':''}>Approved</option>
                </select>`;
                tr.innerHTML = `
                    <td>${creatorDisplay}</td>
                    <td><span class="bm-status bm-status-draft">${e.deliverable_type}</span></td>
                    <td>${statusSelect}</td>
                    <td>${fmtMoney(e.amount)}</td>
                    <td style="font-size:0.8rem;">${e.poc || '—'}</td>
                    <td style="font-size:0.8rem;">${fmtDate(e.delivery_date)}</td>
                    <td>${linkHtml}</td>
                    <td><button class="bm-cancel-btn" style="font-size:0.7rem;padding:3px 8px;color:var(--danger);" onclick="window._bmDeleteEntry('${e.id}','${cid}')">✕</button></td>`;
                tbody.appendChild(tr);
            });
        } catch { tbody.innerHTML = '<tr><td colspan="8" class="bm-empty">Network error.</td></tr>'; }
    }

    // Add entry form
    const addEBtn = document.getElementById('bm-add-entry-btn');
    const addEForm = document.getElementById('bm-add-entry-form');
    addEBtn?.addEventListener('click', () => addEForm.classList.toggle('hidden'));
    document.getElementById('bm-e-cancel')?.addEventListener('click', () => addEForm.classList.add('hidden'));
    document.getElementById('bm-e-submit')?.addEventListener('click', async () => {
        const username = document.getElementById('bm-e-username').value.trim().replace(/^@/,'');
        const errEl = document.getElementById('bm-e-error');
        errEl.classList.add('hidden');
        if (!username) { errEl.textContent = 'Creator username required.'; errEl.classList.remove('hidden'); return; }
        try {
            const res = await fetch(`${API_BASE}/api/entries`, {
                method: 'POST', headers: authHeaders({'Content-Type':'application/json'}),
                body: JSON.stringify({
                    campaign_id: BM.currentCampaign.id,
                    creator_username: username,
                    deliverable_type: document.getElementById('bm-e-type').value,
                    amount: parseFloat(document.getElementById('bm-e-amount').value) || 0,
                    poc: document.getElementById('bm-e-poc').value.trim(),
                    delivery_date: document.getElementById('bm-e-delivery').value || null,
                    content_link: document.getElementById('bm-e-link').value.trim(),
                })
            });
            if (!res.ok) { const d=await res.json(); errEl.textContent=d.error||'Error'; errEl.classList.remove('hidden'); return; }
            addEForm.classList.add('hidden');
            document.getElementById('bm-e-username').value='';
            document.getElementById('bm-e-amount').value='';
            document.getElementById('bm-e-poc').value='';
            document.getElementById('bm-e-link').value='';
            bmLoadEntries(BM.currentCampaign.id);
        } catch { errEl.textContent='Network error.'; errEl.classList.remove('hidden'); }
    });

    // Inline entry status update
    window._bmUpdateEntryStatus = async (eid, cid, status) => {
        try {
            await fetch(`${API_BASE}/api/entries/${eid}`, {
                method: 'PUT', headers: authHeaders({'Content-Type':'application/json'}),
                body: JSON.stringify({status})
            });
        } catch(e) { console.error(e); }
    };

    // Delete entry
    window._bmDeleteEntry = async (eid, cid) => {
        if (!confirm('Delete this entry?')) return;
        try {
            await fetch(`${API_BASE}/api/entries/${eid}`, {method:'DELETE', headers: authHeaders()});
            bmLoadEntries(cid);
        } catch(e) { console.error(e); }
    };

    // Auto-load brand management when tab is clicked
    document.getElementById('nav-brand-mgmt-btn')?.addEventListener('click', () => {
        bmShowLevel('partnerships');
        bmLoadPartnerships();
    });

    // Also load for brand users in Brand Portal
    if (window._userRole === 'brand') {
        // Reuse partnerships API — brand users auto-filtered by backend
        const portalContainer = document.querySelector('#tab-brand .card');
        if (portalContainer) {
            fetch(`${API_BASE}/api/partnerships`, {headers: authHeaders()})
                .then(r => r.json())
                .then(data => {
                    if (!Array.isArray(data) || !data.length) return;
                    portalContainer.innerHTML = '<h3 style="margin-bottom:16px;">Your Partnerships</h3>';
                    data.forEach(p => {
                        portalContainer.innerHTML += `<div class="bm-card" style="margin-bottom:12px;cursor:default;">
                            <div class="bm-card-name">${p.brand_name}</div>
                            ${bmStatus(p.status)}
                            <div class="bm-card-footer">
                                <span class="bm-card-count">${p.campaign_count||0} campaigns</span>
                                <span style="font-size:0.7rem;color:var(--text-muted);">${fmtDate(p.created_at)}</span>
                            </div>
                        </div>`;
                    });
                }).catch(() => {});
        }
    }

    // Auto-load admin/senior panels
    if (window._userRole === 'admin' || window._userRole === 'senior') {
        loadTeam();
        if (window._userRole === 'admin') loadAuditLogs();
    }
});
