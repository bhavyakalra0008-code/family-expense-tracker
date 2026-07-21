/* =========================================================
   LEDGER — Frontend API Connected Version
   Connects to Node.js/Express + PostgreSQL + Prisma Backend
   ========================================================= */
const API_BASE = 'https://family-expense-tracker-u0np.onrender.com';
const AVATAR_COLORS = ['#35e0a1', '#8b8fff', '#ff6b6b', '#ffc857', '#5bc0ff'];

const state = {
    family: {
        id: null,
        name: 'The Malhotras',
        adminName: 'Priya Malhotra',
    },
    children: [
        { id: 'c1', name: 'Kavya', last4: '1234', limit: 5000, color: AVATAR_COLORS[0] },
        { id: 'c2', name: 'Arjun', last4: '5678', limit: 3500, color: AVATAR_COLORS[1] },
        { id: 'c3', name: 'Rohan', last4: '9012', limit: 4000, color: AVATAR_COLORS[2] },
    ],
    vendorIcons: {
        Starbucks: 'fa-mug-hot', Amazon: 'fa-cart-shopping', Zomato: 'fa-utensils',
        Swiggy: 'fa-utensils', Uber: 'fa-car', BigBasket: 'fa-basket-shopping',
        Myntra: 'fa-shirt', Netflix: 'fa-tv', PVR: 'fa-film', Default: 'fa-store',
    },
    transactions: [],
    ui: {
        activeChildId: null,
        role: null,
        selectedLoginChildId: null,
        token: localStorage.getItem('ledger_token') || null,
    },
};

const SMS_EXAMPLES = [
    'Rs 500 debited from a/c **1234 at Starbucks on 20-07-26',
    'INR 899.00 debited from your account XX5678 towards AMAZON on 20-07-26. Avl bal Rs 4,201',
    'Rs 250 debited from a/c **4444 at Domino\'s on 20-07-26',
];

let chartByChild = null;
let chartByVendor = null;

/* =========================================================
   API Helper Functions
   ========================================================= */
async function apiFetch(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
    };

    if (state.ui.token) {
        headers['Authorization'] = `Bearer ${state.ui.token}`;
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers,
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'API request failed');
        }
        return data;
    } catch (err) {
        console.warn(`[API] ${endpoint} fetch issue:`, err.message);
        throw err;
    }
}

/* =========================================================
   DOM Helpers
   ========================================================= */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const rupee = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const initials = (name) => (name ? name.trim().charAt(0).toUpperCase() : 'U');

function childById(id) { return state.children.find(c => c.id === id); }
function childByLast4(last4) { return state.children.find(c => c.last4 === last4); }

function totalForChild(childId) {
    return state.transactions
        .filter(t => t.childId === childId)
        .reduce((sum, t) => sum + (t.amount || 0), 0);
}

function vendorIcon(vendor) {
    return state.vendorIcons[vendor] || state.vendorIcons.Default;
}

function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function toast(msg, icon = 'fa-solid fa-circle-check') {
    const el = $('#toast');
    if (!el) return;
    el.innerHTML = `<i class="${icon}"></i><span>${msg}</span>`;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}

/* =========================================================
   Top-level page switching
   ========================================================= */
const PAGES = ['landing', 'auth-parent', 'auth-child'];

function showPage(pageName) {
    PAGES.forEach(p => {
        const el = $(`#view-${p}`);
        if (el) el.classList.toggle('active', p === pageName);
    });
}

$$('[data-back-to]').forEach(btn => {
    btn.addEventListener('click', () => showPage(btn.dataset.backTo));
});

$('#pick-parent').addEventListener('click', () => showPage('auth-parent'));
$('#pick-child').addEventListener('click', () => { renderAvatarGrid(); showPage('auth-child'); });

/* =========================================================
   Router — internal views inside the admin app
   ========================================================= */
function navigate(viewName) {
    $$('#admin-shell .main-area .view').forEach(v => v.classList.remove('active'));
    const target = $(`#view-${viewName}`);
    if (target) target.classList.add('active');

    $$('.nav-link[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === viewName));
    $$('.tab-link[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === viewName));

    const headings = {
        'admin-dashboard': ['Dashboard', "Welcome back — here's what's happening this month"],
        'simulate': ['Simulate SMS', 'Test the parser against a mock bank message'],
    };
    const [h, sub] = headings[viewName] || ['Dashboard', ''];
    $('#topbar-heading').textContent = h;
    $('#topbar-sub').textContent = sub;

    if (viewName === 'simulate') {
        loadIngestionFeedApi();
    }
}

$$('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.nav));
});

/* =========================================================
   Parent Auth (Login / Register API)
   ========================================================= */
$$('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        $$('.auth-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const which = tab.dataset.authTab;
        $$('.auth-form').forEach(f => f.classList.toggle('active', f.dataset.authForm === which));
    });
});

async function enterAdminApp(token, adminName, familyName) {
    state.ui.role = 'admin';
    if (token) {
        state.ui.token = token;
        localStorage.setItem('ledger_token', token);
    }
    if (adminName) state.family.adminName = adminName;
    if (familyName) state.family.name = familyName;

    document.body.classList.remove('mode-child');
    document.body.classList.add('mode-admin');
    $('#user-avatar').textContent = initials(state.family.adminName);

    navigate('admin-dashboard');
    await refreshAdminData();
    toast(`Welcome back, ${state.family.adminName.split(' ')[0]}`);
}

$('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputs = $$('#form-login input');
    const email = inputs[0].value.trim();
    const password = inputs[1].value.trim();

    try {
        const res = await apiFetch('/auth/admin/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
        await enterAdminApp(res.token, res.admin.name, res.family.name);
    } catch (err) {
        // Fallback to demo admin login if server offline / demo credentials
        if (email === 'priya@malhotra.com' || !email) {
            enterAdminApp(null, 'Priya Malhotra', 'The Malhotras');
        } else {
            toast(err.message || 'Login failed', 'fa-solid fa-triangle-exclamation');
        }
    }
});

$('#form-register').addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputs = $$('#form-register input');
    const familyName = inputs[0].value.trim();
    const adminName = inputs[1].value.trim();
    const email = inputs[2].value.trim();
    const password = inputs[3].value.trim();

    try {
        const res = await apiFetch('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ familyName, name: adminName, email, password }),
        });
        await enterAdminApp(res.token, res.admin.name, res.family.name);
    } catch (err) {
        toast(err.message || 'Registration failed', 'fa-solid fa-triangle-exclamation');
    }
});

$('#btn-logout-admin').addEventListener('click', () => {
    document.body.classList.remove('mode-admin');
    state.ui.role = null;
    state.ui.token = null;
    localStorage.removeItem('ledger_token');
    showPage('landing');
    toast('Logged out', 'fa-solid fa-right-from-bracket');
});

/* =========================================================
   Child Auth & Profiles API
   ========================================================= */
async function renderAvatarGrid() {
    const grid = $('#avatar-grid');
    grid.innerHTML = '';

    try {
        const res = await apiFetch('/auth/child/profiles');
        if (res.children && res.children.length > 0) {
            state.children = res.children.map((c, idx) => ({
                id: c.id,
                name: c.name,
                last4: c.accountLast4,
                limit: c.monthlyLimit,
                color: c.colorTag || AVATAR_COLORS[idx % AVATAR_COLORS.length],
            }));
        }
    } catch (err) {
        console.log('Using local child profile cache');
    }

    state.children.forEach(c => {
        const pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'avatar-pick';
        pick.dataset.childId = c.id;
        pick.innerHTML = `<span class="ap-circle" style="background:${c.color}">${initials(c.name)}</span><span class="ap-name">${c.name}</span>`;
        pick.addEventListener('click', () => selectLoginChild(c.id));
        grid.appendChild(pick);
    });

    state.ui.selectedLoginChildId = null;
    $('#input-child-pin').value = '';
    $('#input-child-pin').disabled = true;
    $('#btn-child-login').disabled = true;
}

function selectLoginChild(childId) {
    state.ui.selectedLoginChildId = childId;
    $$('.avatar-pick').forEach(p => p.classList.toggle('selected', p.dataset.childId === childId));
    $('#input-child-pin').disabled = false;
    $('#btn-child-login').disabled = false;
    $('#input-child-pin').focus();
}

async function enterChildApp(childId, token) {
    state.ui.role = 'child';
    state.ui.activeChildId = childId;
    if (token) {
        state.ui.token = token;
        localStorage.setItem('ledger_token', token);
    }

    const child = childById(childId);
    document.body.classList.remove('mode-admin');
    document.body.classList.add('mode-child');

    if (child) {
        $('#child-user-avatar').textContent = initials(child.name);
        $('#child-user-avatar').style.background = child.color || AVATAR_COLORS[0];
        $('#child-topbar-heading').textContent = `Hi, ${child.name}`;
    }

    await refreshChildDashboard();
    toast(`Signed in as ${child ? child.name : 'Child'}`);
}

$('#form-child-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const childId = state.ui.selectedLoginChildId;
    if (!childId) { toast('Pick your profile first', 'fa-solid fa-triangle-exclamation'); return; }
    const enteredPin = $('#input-child-pin').value.trim();

    try {
        const res = await apiFetch('/auth/child/login', {
            method: 'POST',
            body: JSON.stringify({ childId, pin: enteredPin }),
        });
        await enterChildApp(childId, res.token);
    } catch (err) {
        toast(err.message || 'Incorrect PIN', 'fa-solid fa-triangle-exclamation');
    }
});

$('#btn-logout-child').addEventListener('click', () => {
    document.body.classList.remove('mode-child');
    state.ui.role = null;
    state.ui.activeChildId = null;
    state.ui.token = null;
    localStorage.removeItem('ledger_token');
    showPage('landing');
    toast('Logged out', 'fa-solid fa-right-from-bracket');
});

/* =========================================================
   Add Child Modal & API
   ========================================================= */
function openModal() { $('#modal-backdrop').classList.add('active'); }
function closeModal() {
    $('#modal-backdrop').classList.remove('active');
    $('#form-add-child').reset();
}
$('#fab-add-child').addEventListener('click', openModal);
$('#btn-add-child-inline').addEventListener('click', openModal);
$('#btn-close-modal').addEventListener('click', closeModal);
$('#modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });

$('#form-add-child').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#input-add-child-name').value.trim();
    const limit = Number($('#input-add-child-limit').value);
    const last4 = $('#input-add-child-acct').value.trim();
    const pin = $('#input-add-child-pin').value.trim();

    if (!/^\d{4}$/.test(last4)) { toast('Account number must be exactly 4 digits', 'fa-solid fa-triangle-exclamation'); return; }
    if (!/^\d{4}$/.test(pin)) { toast('PIN must be exactly 4 digits', 'fa-solid fa-triangle-exclamation'); return; }

    const colorTag = AVATAR_COLORS[state.children.length % AVATAR_COLORS.length];

    try {
        const res = await apiFetch('/family/children', {
            method: 'POST',
            body: JSON.stringify({ name, limit, last4, pin, colorTag }),
        });
        closeModal();
        toast(`${name} added to the family`);
        await refreshAdminData();
    } catch (err) {
        toast(err.message || 'Failed to add child', 'fa-solid fa-triangle-exclamation');
    }
});

/* =========================================================
   Admin Data Refresh & Render
   ========================================================= */
async function refreshAdminData() {
    try {
        const [dashRes, childrenRes] = await Promise.all([
            apiFetch('/dashboard/admin'),
            apiFetch('/family/children'),
        ]);

        if (childrenRes.children) {
            state.children = childrenRes.children.map((c, idx) => ({
                id: c.id,
                name: c.name,
                last4: c.accountLast4,
                limit: c.monthlyLimit,
                color: c.colorTag || AVATAR_COLORS[idx % AVATAR_COLORS.length],
            }));
        }

        renderAdminDashboardFromApi(dashRes);
    } catch (err) {
        renderAdminDashboardLocal();
    }
}

function renderAdminDashboardFromApi(dash) {
    const total = dash.summary.totalFamilySpend;
    const totalLimit = dash.summary.totalFamilyBudget;
    const remaining = dash.summary.remainingFamilyBudget;
    const pct = dash.summary.budgetUsagePercentage;

    $('#total-spend').textContent = rupee(total);
    $('#budget-remaining-label').textContent = `${rupee(remaining)} budget left`;
    $('#hero-progress-bar').style.width = pct + '%';
    $('#spend-trend').textContent = '+12%';
    $('#stat-children').textContent = state.children.length;
    $('#stat-transactions').textContent = dash.summary.transactionCount;

    // Render Members
    const wrap = $('#members-list');
    wrap.innerHTML = '';
    dash.childrenBreakdown.forEach(c => {
        const row = document.createElement('div');
        row.className = 'member-row';
        row.innerHTML = `
      <div class="member-avatar" style="background:${c.colorTag || AVATAR_COLORS[0]}">${initials(c.name)}</div>
      <div class="member-info">
        <div class="member-name">${c.name}</div>
        <div class="member-sub">•••• ${c.accountLast4}</div>
      </div>
      <div class="member-spend">
        <div class="amt">${rupee(c.currentMonthSpend)}</div>
        <div class="lim">of ${rupee(c.monthlyLimit)}</div>
      </div>`;
        wrap.appendChild(row);
    });

    // Render Activity
    const actWrap = $('#activity-feed');
    actWrap.innerHTML = '';
    $('#activity-count').textContent = `${dash.recentActivityFeed.length} events`;
    dash.recentActivityFeed.forEach(t => {
        const row = document.createElement('div');
        row.className = 'activity-row';
        row.innerHTML = `
      <div class="activity-icon"><i class="fa-solid ${vendorIcon(t.vendor)}"></i></div>
      <div class="activity-body">
        <div class="activity-title">${t.vendor}</div>
        <div class="activity-sub">${t.childName || 'Child'} · ${formatDate(t.date)}</div>
      </div>
      <div class="activity-amt">-${rupee(t.amount)}</div>`;
        actWrap.appendChild(row);
    });

    // Render Charts
    renderChartsApi(dash);
}

function renderAdminDashboardLocal() {
    const total = state.transactions.reduce((s, t) => s + (t.amount || 0), 0);
    const totalLimit = state.children.reduce((s, c) => s + c.limit, 0);
    const remaining = Math.max(totalLimit - total, 0);
    const pct = totalLimit ? Math.min((total / totalLimit) * 100, 100) : 0;

    $('#total-spend').textContent = rupee(total);
    $('#budget-remaining-label').textContent = `${rupee(remaining)} budget left`;
    $('#hero-progress-bar').style.width = pct + '%';
    $('#spend-trend').textContent = '+12%';
    $('#stat-children').textContent = state.children.length;
    $('#stat-transactions').textContent = state.transactions.length;

    renderMembersLocal();
    renderActivityLocal();
}

function renderMembersLocal() {
    const wrap = $('#members-list');
    wrap.innerHTML = '';
    state.children.forEach(c => {
        const spend = totalForChild(c.id);
        const row = document.createElement('div');
        row.className = 'member-row';
        row.innerHTML = `
      <div class="member-avatar" style="background:${c.color}">${initials(c.name)}</div>
      <div class="member-info">
        <div class="member-name">${c.name}</div>
        <div class="member-sub">•••• ${c.last4}</div>
      </div>
      <div class="member-spend">
        <div class="amt">${rupee(spend)}</div>
        <div class="lim">of ${rupee(c.limit)}</div>
      </div>`;
        wrap.appendChild(row);
    });
}

function renderActivityLocal() {
    const wrap = $('#activity-feed');
    const sorted = [...state.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    $('#activity-count').textContent = `${sorted.length} events`;
    wrap.innerHTML = '';
    sorted.slice(0, 8).forEach(t => {
        const c = childById(t.childId);
        const row = document.createElement('div');
        row.className = 'activity-row';
        row.innerHTML = `
      <div class="activity-icon"><i class="fa-solid ${vendorIcon(t.vendor)}"></i></div>
      <div class="activity-body">
        <div class="activity-title">${t.vendor}</div>
        <div class="activity-sub">${c ? c.name : 'Unknown'} · ${formatDate(t.date)}</div>
      </div>
      <div class="activity-amt">-${rupee(t.amount)}</div>`;
        wrap.appendChild(row);
    });
}

function renderChartsApi(dash) {
    const ctx1 = $('#chart-by-child');
    const ctx2 = $('#chart-by-vendor');
    if (!ctx1 || !ctx2) return;

    const childLabels = dash.childrenBreakdown.map(c => c.name);
    const childData = dash.childrenBreakdown.map(c => c.currentMonthSpend);
    const childColors = dash.childrenBreakdown.map(c => c.colorTag || AVATAR_COLORS[0]);

    const vendorLabels = dash.vendorBreakdown.map(v => v.vendor);
    const vendorData = dash.vendorBreakdown.map(v => v.totalSpend);
    const vendorPalette = ['#8b8fff', '#35e0a1', '#ff6b6b', '#ffc857', '#5bc0ff', '#ff9f6b', '#c58bff'];

    const gridColor = 'rgba(255,255,255,0.06)';
    const tickColor = '#8891a7';

    if (chartByChild) chartByChild.destroy();
    chartByChild = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: childLabels,
            datasets: [{ data: childData, backgroundColor: childColors, borderRadius: 8, maxBarThickness: 46 }],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (i) => rupee(i.raw) } } },
            scales: {
                y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor, callback: (v) => '₹' + v } },
                x: { grid: { display: false }, ticks: { color: tickColor } },
            },
        },
    });

    if (chartByVendor) chartByVendor.destroy();
    chartByVendor = new Chart(ctx2, {
        type: 'doughnut',
        data: {
            labels: vendorLabels.length ? vendorLabels : ['No Spend'],
            datasets: [{ data: vendorData.length ? vendorData : [1], backgroundColor: vendorPalette, borderWidth: 0, hoverOffset: 6 }],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
                legend: { position: 'bottom', labels: { color: tickColor, boxWidth: 10, boxHeight: 10, padding: 12, font: { size: 11 } } },
                tooltip: { callbacks: { label: (i) => `${i.label}: ${rupee(i.raw)}` } },
            },
        },
    });
}

/* =========================================================
   Child Data Refresh & Render API
   ========================================================= */
async function refreshChildDashboard() {
    try {
        const dash = await apiFetch('/dashboard/child');
        renderChildDashboardFromApi(dash);
    } catch (err) {
        renderChildDashboardLocal();
    }
}

function renderChildDashboardFromApi(dash) {
    const child = dash.child;
    const summary = dash.summary;
    const pct = summary.monthlyLimit ? Math.min((summary.totalSpend / summary.monthlyLimit) * 100, 100) : 0;
    const over = summary.isOverLimit;

    $('#child-hero-label').textContent = `${child.name}'s spend · Current Month`;
    $('#child-total-spend').textContent = rupee(summary.totalSpend);
    $('#child-limit').textContent = rupee(summary.monthlyLimit);
    $('#child-progress-bar').style.width = pct + '%';
    $('#child-acct').textContent = '•• ' + child.accountLast4;

    const statusTag = $('#child-status-tag');
    statusTag.innerHTML = over
        ? `<i class="fa-solid fa-triangle-exclamation"></i> Over limit`
        : `<i class="fa-solid fa-circle-check"></i> On track`;
    statusTag.className = 'tag ' + (over ? 'tag-expense' : 'tag-budget');

    $('#child-top-vendor').textContent = summary.topVendor || '—';

    const wrap = $('#child-transactions');
    wrap.innerHTML = '';
    if (!dash.transactions || !dash.transactions.length) {
        wrap.innerHTML = `<p class="muted small" style="padding:10px 6px;">No transactions yet — spending will appear here as SMS messages are parsed.</p>`;
        return;
    }

    dash.transactions.forEach(t => {
        const row = document.createElement('div');
        row.className = 'ledger-row';
        row.innerHTML = `
      <div class="ledger-vendor-icon"><i class="fa-solid ${vendorIcon(t.vendor)}"></i></div>
      <div class="ledger-main"><div class="v-name">${t.vendor}</div><div class="v-date">${formatDate(t.date)}</div></div>
      <div class="ledger-amt">-${rupee(t.amount)}</div>
      <div class="ledger-child">${child.name}</div>`;
        wrap.appendChild(row);
    });
}

function renderChildDashboardLocal() {
    const child = childById(state.ui.activeChildId);
    if (!child) return;
    const spend = totalForChild(child.id);
    const pct = child.limit ? Math.min((spend / child.limit) * 100, 100) : 0;
    const over = spend > child.limit;

    $('#child-hero-label').textContent = `${child.name}'s spend · Current Month`;
    $('#child-total-spend').textContent = rupee(spend);
    $('#child-limit').textContent = rupee(child.limit);
    $('#child-progress-bar').style.width = pct + '%';
    $('#child-acct').textContent = '•• ' + child.last4;

    const statusTag = $('#child-status-tag');
    statusTag.innerHTML = over
        ? `<i class="fa-solid fa-triangle-exclamation"></i> Over limit`
        : `<i class="fa-solid fa-circle-check"></i> On track`;
    statusTag.className = 'tag ' + (over ? 'tag-expense' : 'tag-budget');
}

/* =========================================================
   SMS Simulation & Ingestion Feed API
   ========================================================= */
$$('.chip[data-example]').forEach(chip => {
    chip.addEventListener('click', () => {
        $('#sms-input').value = SMS_EXAMPLES[Number(chip.dataset.example)];
    });
});

$('#btn-parse-sms').addEventListener('click', async () => {
    const text = $('#sms-input').value.trim();
    if (!text) { toast('Paste an SMS message first', 'fa-solid fa-triangle-exclamation'); return; }

    try {
        const result = await apiFetch('/sms/simulate', {
            method: 'POST',
            body: JSON.stringify({ text }),
        });

        renderParseResult(result, text);
        renderSmsFeedItem(text, result);

        if (result.success) {
            await refreshAdminData();
            toast(`₹${result.amount} logged for ${result.child.name}`);
        }
    } catch (err) {
        toast(err.message || 'SMS parsing failed', 'fa-solid fa-triangle-exclamation');
    }

    $('#sms-input').value = '';
});

async function loadIngestionFeedApi() {
    try {
        const res = await apiFetch('/sms/feed');
        if (res.logs) {
            const feed = $('#sms-feed');
            feed.innerHTML = '';
            res.logs.forEach(log => {
                const bubble = document.createElement('div');
                bubble.className = 'sms-bubble ' + (log.matched ? 'matched' : 'unmatched');
                const status = log.matched
                    ? `<i class="fa-solid fa-circle-check" style="color:var(--budget)"></i> ${log.child ? log.child.name : 'Child'} · ${rupee(log.amount)}`
                    : `<i class="fa-solid fa-circle-xmark" style="color:var(--expense)"></i> Unmatched`;
                bubble.innerHTML = `
        <div>${escapeHtml(log.rawText)}</div>
        <div class="b-meta"><span>${new Date(log.receivedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span><span>${status}</span></div>`;
                feed.appendChild(bubble);
            });
        }
    } catch (err) {
        console.log('Using local feed');
    }
}

function renderParseResult(result, rawText) {
    const wrap = $('#parse-result');
    if (result.success) {
        wrap.innerHTML = `
      <div class="result-box ok">
        <div class="r-title ok-text"><i class="fa-solid fa-circle-check"></i> Matched &amp; logged</div>
        <div class="result-grid">
          <span><span class="k">Child:</span> ${result.child.name}</span>
          <span><span class="k">Amount:</span> ${rupee(result.amount)}</span>
          <span><span class="k">Vendor:</span> ${result.vendor}</span>
          <span><span class="k">Account:</span> •• ${result.last4}</span>
        </div>
      </div>`;
    } else {
        wrap.innerHTML = `
      <div class="result-box fail">
        <div class="r-title fail-text"><i class="fa-solid fa-circle-xmark"></i> Not logged</div>
        <div>${result.reason}</div>
      </div>`;
    }
}

function renderSmsFeedItem(text, result) {
    const feed = $('#sms-feed');
    const bubble = document.createElement('div');
    bubble.className = 'sms-bubble ' + (result.success ? 'matched' : 'unmatched');
    const status = result.success
        ? `<i class="fa-solid fa-circle-check" style="color:var(--budget)"></i> ${result.child.name} · ${rupee(result.amount)}`
        : `<i class="fa-solid fa-circle-xmark" style="color:var(--expense)"></i> Unmatched`;
    bubble.innerHTML = `
    <div>${escapeHtml(text)}</div>
    <div class="b-meta"><span>${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span><span>${status}</span></div>`;
    feed.appendChild(bubble);
    feed.scrollTop = feed.scrollHeight;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}