/**
 * app.js — Application Controller
 * Navigation, dashboard, product table, global utilities
 */

// ===== CHART DEFAULTS (Global helper) =====
function chartDefaults(yLabel = '') {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: {
                labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12, usePointStyle: true }
            },
            tooltip: {
                backgroundColor: 'rgba(13,18,32,0.95)',
                borderColor: 'rgba(99,102,241,0.4)',
                borderWidth: 1,
                titleColor: '#f1f5f9',
                bodyColor: '#94a3b8',
                padding: 12,
                callbacks: {
                    label: (ctx) => {
                        const v = ctx.parsed.y;
                        if (typeof v !== 'number') return;
                        return ` ${ctx.dataset.label}: ${v >= 1000 ? v.toLocaleString('en-IN') : v}`;
                    }
                }
            }
        },
        scales: {
            x: {
                grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
                ticks: { color: '#475569', font: { size: 11 } }
            },
            y: {
                grid: { color: 'rgba(255,255,255,0.06)', drawBorder: false },
                ticks: { color: '#475569', font: { size: 11 } },
                title: yLabel ? { display: true, text: yLabel, color: '#475569', font: { size: 11 } } : undefined
            }
        }
    };
}

// ===== TOAST =====
function showToast(msg, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✓', error: '✗', info: 'ℹ' };
    toast.textContent = `${icons[type] || ''} ${msg}`;
    container.appendChild(toast);
    setTimeout(() => toast.style.opacity = '0', 3200);
    setTimeout(() => toast.remove(), 3500);
}

// ===== NAVIGATION =====
function switchModule(name) {
    document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const mod = document.getElementById(`module-${name}`);
    const nav = document.getElementById(`nav-${name}`);
    if (mod) mod.classList.add('active');
    if (nav) nav.classList.add('active');

    const titles = {
        'dashboard': 'Dashboard',
        'product-db': 'Product Database',
        'stock-tracker': 'Stock Tracker',
        'optimization': 'EOQ Optimizer',
        'analyzer': 'Statistical Analyzer',
        'reporting': 'Reports & Alerts'
    };
    document.getElementById('topbar-title').textContent = titles[name] || name;

    // Lazy-init per module
    if (name === 'stock-tracker') Tracker.renderStockLevels();
    if (name === 'reporting') Reporting.renderAlerts();
    if (name === 'analyzer') {
        const sel = document.getElementById('analyzer-sku');
        if (sel && sel.value) Analyzer.runAnalysis(sel.value);
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const main = document.getElementById('main-content');
    sidebar.style.transform = sidebar.style.transform === 'translateX(-100%)' ? '' : 'translateX(-100%)';
    main.style.marginLeft = main.style.marginLeft === '0px' ? 'var(--sidebar-w)' : '0px';
}

// ===== DASHBOARD =====
let dashTrendChart = null;
let dashPieChart = null;
let dashBarChart = null;

function updateDashboardKPIs() {
    const count = DB.getProductCount();
    const value = DB.getTotalInventoryValue();
    const lowItems = DB.getLowStockItems(Optimizer.getROP());
    const anomalyCount = Analyzer.getAnomalyCount();

    document.getElementById('kpi-sku-count').textContent = count;
    document.getElementById('kpi-inv-value').textContent = `₹${(value / 1e5).toFixed(2)}L`;
    document.getElementById('kpi-low-count').textContent = lowItems.length;
    document.getElementById('kpi-anomaly-count').textContent = anomalyCount;

    // Update alert badge
    const alertCount = Reporting.getAlertCount();
    document.getElementById('alert-count').textContent = alertCount;
}

function renderDashboardCharts() {
    // Trend chart (simulated 7-day stock levels for 3 categories)
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const baseE = 400, baseP = 9000, baseF = 300;

    const electronicsData = days.map((_, i) => Math.round(baseE - i * 12 + (Math.random() - 0.5) * 30));
    const pharmaData = days.map((_, i) => Math.round(baseP - i * 180 + (Math.random() - 0.5) * 200));
    const fmcgData = days.map((_, i) => Math.round(baseF - i * 15 + (Math.random() - 0.5) * 20));

    if (dashTrendChart) dashTrendChart.destroy();
    const tCtx = document.getElementById('dash-trend-chart').getContext('2d');
    dashTrendChart = new Chart(tCtx, {
        type: 'line',
        data: {
            labels: days,
            datasets: [
                { label: 'Electronics', data: electronicsData, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.1)', fill: true, tension: 0.4, borderWidth: 2.5, pointRadius: 4 },
                { label: 'Pharma', data: pharmaData.map(v => Math.round(v / 10)), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.05)', fill: true, tension: 0.4, borderWidth: 2.5, pointRadius: 4 },
                { label: 'FMCG', data: fmcgData, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.05)', fill: true, tension: 0.4, borderWidth: 2.5, pointRadius: 4 },
            ]
        },
        options: chartDefaults('Units (normalized)')
    });

    // Pie chart — stock value by category
    const products = DB.getProducts();
    const catValues = {};
    products.forEach(p => {
        const v = (DB.getStock(p.sku) || 0) * p.unitCost;
        catValues[p.category] = (catValues[p.category] || 0) + v;
    });
    const catColors = { Electronics: '#6366f1', Pharma: '#10b981', FMCG: '#f59e0b', Industrial: '#38bdf8', Apparel: '#ec4899' };

    if (dashPieChart) dashPieChart.destroy();
    const pCtx = document.getElementById('dash-pie-chart').getContext('2d');
    dashPieChart = new Chart(pCtx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(catValues),
            datasets: [{
                data: Object.values(catValues).map(v => Math.round(v)),
                backgroundColor: Object.keys(catValues).map(k => catColors[k] || '#8b5cf6'),
                borderColor: 'rgba(8,11,20,0.8)',
                borderWidth: 3,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '65%',
            plugins: {
                legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 10 } },
                tooltip: {
                    backgroundColor: 'rgba(13,18,32,0.95)',
                    callbacks: {
                        label: (ctx) => ` ₹${(ctx.parsed / 1e5).toFixed(2)}L (${ctx.label})`
                    }
                }
            }
        }
    });

    // Bar chart — top 8 SKUs by current stock level
    const allProducts = DB.getProducts();
    const topSkus = allProducts
        .map(p => ({ name: p.name.length > 14 ? p.name.slice(0, 14) + '…' : p.name, qty: DB.getStock(p.sku) || 0, cat: p.category }))
        .sort((a, b) => b.qty - a.qty).slice(0, 8);
    const catColors2 = { Electronics: '#6366f1', Pharma: '#10b981', FMCG: '#f59e0b', Industrial: '#38bdf8', Apparel: '#ec4899' };

    if (dashBarChart) dashBarChart.destroy();
    const bCtx = document.getElementById('dash-bar-chart');
    if (bCtx) {
        dashBarChart = new Chart(bCtx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: topSkus.map(s => s.name),
                datasets: [{
                    label: 'Stock Qty',
                    data: topSkus.map(s => s.qty),
                    backgroundColor: topSkus.map(s => (catColors2[s.cat] || '#8b5cf6') + 'cc'),
                    borderColor: topSkus.map(s => catColors2[s.cat] || '#8b5cf6'),
                    borderWidth: 1.5, borderRadius: 4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(13,18,32,0.95)', titleColor: '#f1f5f9', bodyColor: '#94a3b8' } },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#475569', font: { size: 10 } } },
                    y: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } }
                }
            }
        });
    }
}

function renderActivityList() {
    const txns = DB.getTransactions().slice(0, 8);
    const container = document.getElementById('activity-list');
    if (!container) return;
    container.innerHTML = txns.map(t => {
        const badgeClass = t.type === 'IN' ? 'badge-in' : t.type === 'OUT' ? 'badge-out' : 'badge-adj';
        const typeLabel = t.type === 'IN' ? 'IN' : t.type === 'OUT' ? 'OUT' : 'ADJ';
        const p = DB.getProduct(t.sku);
        const dt = new Date(t.timestamp);
        const timeAgo = formatTimeAgo(dt);
        return `<div class="activity-item">
      <div class="activity-badge ${badgeClass}">${typeLabel}</div>
      <div class="activity-info">
        <div class="a-main">${p ? p.name : t.sku} <span style="color:var(--text-muted);font-size:0.75rem">(${t.sku})</span></div>
        <div class="a-sub">${t.ref || 'No reference'} · ${timeAgo}</div>
      </div>
      <div class="activity-qty" style="color:${t.type === 'IN' ? 'var(--success)' : t.type === 'OUT' ? 'var(--danger)' : 'var(--warning)'}">
        ${t.type === 'IN' ? '+' : t.type === 'OUT' ? '-' : '±'}${t.qty.toLocaleString()}
      </div>
    </div>`;
    }).join('');
}

function formatTimeAgo(date) {
    const diff = Date.now() - date.getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

// ===== PRODUCT DB =====
function renderProductTable(products) {
    const tbody = document.getElementById('product-tbody');
    if (!tbody) return;
    tbody.innerHTML = products.map(p => {
        const qty = DB.getStock(p.sku);
        let statusCls = 'badge-success';
        if (p.status !== 'Active') statusCls = 'badge-warning';
        return `<tr>
      <td class="mono" style="color:var(--accent-light)">${p.sku}</td>
      <td style="font-weight:500">${p.name}</td>
      <td><span class="badge badge-info">${p.category}</span></td>
      <td>${p.unit}</td>
      <td class="mono">₹${p.unitCost.toLocaleString('en-IN')}</td>
      <td class="mono">${p.leadTime}</td>
      <td style="color:var(--text-secondary)">${p.supplier}</td>
      <td><span class="badge ${statusCls}">${p.status}</span></td>
      <td>
        <div class="action-btns">
          <button class="action-btn" onclick="viewInOptimizer('${p.sku}')">EOQ</button>
          <button class="action-btn" onclick="viewInAnalyzer('${p.sku}')">Analyze</button>
        </div>
      </td>
    </tr>`;
    }).join('');
}

function filterProducts(query) {
    const cat = document.getElementById('cat-filter').value;
    const p = DB.getProducts({ search: query, category: cat });
    renderProductTable(p);
}

function openAddProductModal() {
    document.getElementById('add-product-modal').classList.add('open');
}
function closeModal(id) {
    document.getElementById(id).classList.remove('open');
}

function addProduct() {
    const prod = {
        sku: document.getElementById('p-sku').value.trim().toUpperCase(),
        name: document.getElementById('p-name').value.trim(),
        category: document.getElementById('p-category').value,
        unit: document.getElementById('p-unit').value.trim() || 'pcs',
        unitCost: parseFloat(document.getElementById('p-cost').value) || 0,
        leadTime: parseInt(document.getElementById('p-lead').value) || 7,
        supplier: document.getElementById('p-supplier').value.trim(),
        orderingCost: parseFloat(document.getElementById('p-ordering-cost').value) || 500,
        holdingPct: parseFloat(document.getElementById('p-holding').value) || 25,
        annualDemand: parseInt(document.getElementById('p-demand').value) || 1000,
    };
    if (!prod.sku || !prod.name) { showToast('SKU and name required', 'error'); return; }
    const result = DB.addProduct(prod);
    if (!result.ok) { showToast(result.msg, 'error'); return; }
    closeModal('add-product-modal');
    filterProducts(document.getElementById('product-search').value);
    updateDashboardKPIs();
    showToast(`Product ${prod.sku} added`, 'success');
}

function viewInOptimizer(sku) {
    switchModule('optimization');
    setTimeout(() => {
        const sel = document.getElementById('eoq-sku');
        if (sel) { sel.value = sku; Optimizer.loadEOQData(sku); }
    }, 100);
}

function viewInAnalyzer(sku) {
    switchModule('analyzer');
    setTimeout(() => {
        const sel = document.getElementById('analyzer-sku');
        if (sel) { sel.value = sku; Analyzer.runAnalysis(sku); }
    }, 100);
}

// ===== SYSTEM CLOCK =====
function startClock() {
    const el = document.getElementById('sys-time');
    const tick = () => {
        const now = new Date();
        el.textContent = now.toLocaleTimeString('en-IN', { hour12: false });
    };
    tick();
    setInterval(tick, 1000);
}

// ===== NAVIGATION WIRING =====
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        switchModule(item.dataset.module);
    });
});

// ===== INIT ALL MODULES =====
function initAllModules() {
    // Initialize Product Table
    renderProductTable(DB.getProducts());

    // Initialize Tracker
    Tracker.init();

    // Initialize Optimizer
    Optimizer.init();

    // Initialize Analyzer
    Analyzer.init();

    // Initialize Reporting
    Reporting.init();

    // Dashboard
    updateDashboardKPIs();
    renderDashboardCharts();
    renderActivityList();

    showToast('InvenIQ system initialised', 'success');
}

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', () => {
    startClock();
    initAllModules();
});
