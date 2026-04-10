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
    // Show Team tab for admin and senior
    const role = user.role || 'junior';
    if (role === 'admin' || role === 'senior') {
        const teamBtn = document.getElementById('nav-team-btn');
        if (teamBtn) teamBtn.classList.remove('hidden');
    }
    // Store role globally for other functions
    window._userRole = role;
    window._userEmail = user.email;
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

    // ─── Team Management (Admin Only) ───
    const teamTbody = document.getElementById('team-tbody');

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
                const roleBadgeClass = isAdmin ? 'role-admin' : isSenior ? 'role-senior' : 'role-junior';
                const authMethod = u.auth_method || 'google';
                const authBadge = authMethod === 'password'
                    ? '<span class="auth-badge auth-password">Password</span>'
                    : '<span class="auth-badge auth-google">Google</span>';

                let actionHtml = '';
                if (isAdmin) {
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

    // Auto-load admin/senior panels
    if (window._userRole === 'admin' || window._userRole === 'senior') {
        loadTeam();
        if (window._userRole === 'admin') loadAuditLogs();
    }
});
