/**
 * optimizer.js — EOQ Optimization Module
 * Economic Order Quantity, Reorder Point, Safety Stock, Demand Forecasting
 */

const Optimizer = (() => {
    let forecastChart = null;
    let costChart = null;
    const ropStore = {};

    // ===== EOQ FORMULA =====
    // EOQ = sqrt(2 * D * S / (H * C))
    function calcEOQ(D, S, C, H_pct) {
        const H = (H_pct / 100) * C; // Annual holding cost per unit
        return Math.sqrt((2 * D * S) / H);
    }

    // Reorder Point = (Average Daily Demand * Lead Time) + Safety Stock
    function calcROP(D, leadTime, safetyStock) {
        const avgDaily = D / 365;
        return Math.ceil(avgDaily * leadTime + safetyStock);
    }

    // Number of orders per year
    function calcOrderFrequency(D, EOQ) {
        return D / EOQ;
    }

    // Total Annual Cost = Purchase + Ordering + Holding
    function calcTotalCost(D, C, S, EOQ, H_pct) {
        const H = (H_pct / 100) * C;
        const purchasing = D * C;
        const ordering = (D / EOQ) * S;
        const holding = (EOQ / 2) * H;
        return { purchasing, ordering, holding, total: purchasing + ordering + holding };
    }

    // ===== DEMAND FORECASTING: Holt's (double exponential) ===
    function forecastDemand(annualDemand, months = 12) {
        const alpha = 0.35;    // level smoothing
        const beta = 0.12;    // trend smoothing
        const monthlyBase = annualDemand / 12;

        // Generate some historical variation
        const hist = Array.from({ length: 6 }, (_, i) => {
            const trend = 1 + i * 0.015;
            return Math.round(monthlyBase * trend * (0.85 + Math.random() * 0.3));
        });

        let L = hist[0];
        let T = (hist[hist.length - 1] - hist[0]) / (hist.length - 1);
        hist.forEach(v => {
            const prevL = L;
            L = alpha * v + (1 - alpha) * (L + T);
            T = beta * (L - prevL) + (1 - beta) * T;
        });

        const forecast = [];
        for (let i = 1; i <= months; i++) {
            forecast.push(Math.max(0, Math.round(L + i * T)));
        }
        return { hist, forecast };
    }

    function loadEOQData(sku) {
        const p = DB.getProduct(sku);
        if (!p) return;
        document.getElementById('eoq-demand').value = p.annualDemand;
        document.getElementById('eoq-ordering').value = p.orderingCost;
        document.getElementById('eoq-cost').value = p.unitCost;
        document.getElementById('eoq-holding').value = p.holdingPct;
        document.getElementById('eoq-lead').value = p.leadTime;
        document.getElementById('eoq-safety').value = Math.ceil(p.annualDemand / 365 * p.leadTime * 0.5);
    }

    function computeEOQ() {
        const sku = document.getElementById('eoq-sku').value;
        const D = parseFloat(document.getElementById('eoq-demand').value);
        const S = parseFloat(document.getElementById('eoq-ordering').value);
        const C = parseFloat(document.getElementById('eoq-cost').value);
        const H = parseFloat(document.getElementById('eoq-holding').value);
        const L = parseFloat(document.getElementById('eoq-lead').value);
        const SS = parseFloat(document.getElementById('eoq-safety').value) || 0;

        if (!D || !S || !C || !H || !L) { showToast('Please fill all parameters', 'error'); return; }

        const eoq = calcEOQ(D, S, C, H);
        const rop = calcROP(D, L, SS);
        const freq = calcOrderFrequency(D, eoq);
        const costs = calcTotalCost(D, C, S, eoq, H);
        const cycle = 365 / freq;

        ropStore[sku] = rop;

        document.getElementById('eoq-results').innerHTML = `
      <div class="eoq-result-grid">
        <div class="eoq-result-item">
          <div class="r-label">Economic Order Quantity</div>
          <div class="r-value">${Math.round(eoq)}</div>
          <div class="r-unit">units per order</div>
        </div>
        <div class="eoq-result-item">
          <div class="r-label">Reorder Point (ROP)</div>
          <div class="r-value" style="color:#34d399">${rop}</div>
          <div class="r-unit">units trigger level</div>
        </div>
        <div class="eoq-result-item">
          <div class="r-label">Safety Stock</div>
          <div class="r-value" style="color:#7dd3fc">${SS}</div>
          <div class="r-unit">units buffer</div>
        </div>
        <div class="eoq-result-item">
          <div class="r-label">Order Frequency</div>
          <div class="r-value" style="color:#fcd34d">${freq.toFixed(1)}</div>
          <div class="r-unit">orders / year (${Math.round(cycle)} day cycle)</div>
        </div>
        <div class="eoq-result-item">
          <div class="r-label">Annual Ordering Cost</div>
          <div class="r-value" style="color:#c084fc">₹${costs.ordering.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          <div class="r-unit">per year</div>
        </div>
        <div class="eoq-result-item">
          <div class="r-label">Annual Holding Cost</div>
          <div class="r-value" style="color:#f87171">₹${costs.holding.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          <div class="r-unit">per year</div>
        </div>
        <div class="eoq-result-item" style="grid-column:span 2; border-color:rgba(99,102,241,0.4)">
          <div class="r-label">Total Annual Inventory Cost</div>
          <div class="r-value" style="color:#818cf8;font-size:1.6rem">₹${costs.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          <div class="r-unit">Purchase ₹${(costs.purchasing / 1e5).toFixed(2)}L + Ordering ₹${costs.ordering.toLocaleString('en-IN', { maximumFractionDigits: 0 })} + Holding ₹${costs.holding.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
        </div>
      </div>
    `;

        // Forecast chart
        const { hist, forecast } = forecastDemand(D, 12);
        const labels6 = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const futureLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const allLabels = [...labels6, ...futureLabels];
        const allData = [...hist, ...forecast];

        if (forecastChart) forecastChart.destroy();
        const fCtx = document.getElementById('forecast-chart').getContext('2d');
        forecastChart = new Chart(fCtx, {
            type: 'line',
            data: {
                labels: allLabels,
                datasets: [
                    {
                        label: 'Historical',
                        data: [...hist, ...Array(12).fill(null)],
                        borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.15)',
                        borderWidth: 2, fill: true, tension: 0.4, pointRadius: 4
                    },
                    {
                        label: 'Forecast',
                        data: [...Array(6).fill(null), ...forecast],
                        borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)',
                        borderWidth: 2, borderDash: [6, 3], fill: true, tension: 0.4, pointRadius: 4
                    }
                ]
            },
            options: chartDefaults('Demand (units)')
        });

        // Cost analysis chart — vary EOQ ±80% to show total cost curve
        const eoqRange = [];
        const eoqCosts = { ordering: [], holding: [], total: [] };
        for (let mult = 0.2; mult <= 2.0; mult += 0.1) {
            const q = Math.round(eoq * mult);
            const Hval = (H / 100) * C;
            eoqRange.push(q);
            const ord = (D / q) * S;
            const hold = (q / 2) * Hval;
            eoqCosts.ordering.push(Math.round(ord));
            eoqCosts.holding.push(Math.round(hold));
            eoqCosts.total.push(Math.round(ord + hold));
        }

        if (costChart) costChart.destroy();
        const cCtx = document.getElementById('cost-chart').getContext('2d');
        costChart = new Chart(cCtx, {
            type: 'line',
            data: {
                labels: eoqRange,
                datasets: [
                    { label: 'Ordering Cost', data: eoqCosts.ordering, borderColor: '#f59e0b', borderWidth: 2, fill: false, tension: 0.3, pointRadius: 2 },
                    { label: 'Holding Cost', data: eoqCosts.holding, borderColor: '#ef4444', borderWidth: 2, fill: false, tension: 0.3, pointRadius: 2 },
                    { label: 'Total Cost', data: eoqCosts.total, borderColor: '#6366f1', borderWidth: 2.5, fill: false, tension: 0.3, pointRadius: 2 },
                ]
            },
            options: { ...chartDefaults('₹ Cost'), plugins: { ...chartDefaults().plugins, title: { display: true, text: `↑ EOQ* = ${Math.round(eoq)} units`, color: '#818cf8', font: { size: 11, weight: '600' } } } }
        });

        showToast(`EOQ computed for ${sku}: ${Math.round(eoq)} units`, 'success');
        return ropStore;
    }

    function populateSKUDropdown() {
        const sel = document.getElementById('eoq-sku');
        if (!sel) return;
        sel.innerHTML = '';
        DB.getProducts().forEach(p => {
            const o = document.createElement('option');
            o.value = p.sku;
            o.textContent = `${p.sku} — ${p.name}`;
            sel.appendChild(o);
        });
        if (sel.value) loadEOQData(sel.value);
    }

    function init() {
        populateSKUDropdown();
        document.getElementById('eoq-sku').addEventListener('change', () => {
            loadEOQData(document.getElementById('eoq-sku').value);
        });
    }

    function getROP() { return { ...ropStore }; }

    return { init, computeEOQ, loadEOQData, getROP };
})();

function computeEOQ() { Optimizer.computeEOQ(); }
function loadEOQData(sku) { Optimizer.loadEOQData(sku); }
