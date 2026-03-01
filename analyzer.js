/**
 * analyzer.js — Statistical Analyzer Module
 * Moving averages, Z-score outlier detection, consumption pattern analysis
 */

const Analyzer = (() => {
    let anomalyChart = null;

    // ===== MOVING AVERAGE =====
    function movingAverage(data, window) {
        return data.map((_, i) => {
            if (i < window - 1) return null;
            const slice = data.slice(i - window + 1, i + 1);
            return slice.reduce((a, b) => a + b, 0) / window;
        });
    }

    // ===== STANDARD DEVIATION & Z-SCORE =====
    function stats(data) {
        const n = data.length;
        const mean = data.reduce((a, b) => a + b, 0) / n;
        const variance = data.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
        const std = Math.sqrt(variance);
        return { mean, std, n };
    }

    function detectAnomalies(data, threshold) {
        const { mean, std } = stats(data);
        return data.map((v, i) => {
            const z = std === 0 ? 0 : (v - mean) / std;
            return { index: i, value: v, z: +z.toFixed(2), isAnomaly: Math.abs(z) > threshold };
        });
    }

    // ===== POPULATE DROPDOWN =====
    function populateSKUDropdown() {
        const sel = document.getElementById('analyzer-sku');
        if (!sel) return;
        sel.innerHTML = '';
        DB.getProducts().forEach(p => {
            const o = document.createElement('option');
            o.value = p.sku;
            o.textContent = `${p.sku} — ${p.name}`;
            sel.appendChild(o);
        });
    }

    // ===== FULL ANALYSIS RUN =====
    function runAnalysis(sku) {
        if (!sku) return;
        const data = DB.getConsumptionHistory(sku);
        const window = parseInt(document.getElementById('ma-window').value) || 5;
        const threshold = parseFloat(document.getElementById('z-threshold').value) || 2.0;

        const ma = movingAverage(data, window);
        const anomalyPoints = detectAnomalies(data, threshold);
        const anomalies = anomalyPoints.filter(a => a.isAnomaly);
        const { mean, std } = stats(data);
        const min = Math.min(...data);
        const max = Math.max(...data);

        // Labels
        const labels = data.map((_, i) => `Day ${i + 1}`);

        // Chart
        if (anomalyChart) anomalyChart.destroy();
        const ctx = document.getElementById('anomaly-chart').getContext('2d');
        anomalyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Daily Consumption',
                        data,
                        borderColor: '#6366f1',
                        backgroundColor: 'rgba(99,102,241,0.1)',
                        fill: true, tension: 0.3, borderWidth: 2, pointRadius: 3, pointHoverRadius: 6
                    },
                    {
                        label: `${window}-Day MA`,
                        data: ma,
                        borderColor: '#10b981',
                        borderWidth: 2.5, borderDash: [4, 2],
                        fill: false, tension: 0.4, pointRadius: 0
                    },
                    {
                        label: 'Anomaly',
                        data: data.map((v, i) => anomalyPoints[i].isAnomaly ? v : null),
                        borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.85)',
                        type: 'scatter', pointRadius: 8, pointStyle: 'triangle', showLine: false
                    },
                    {
                        label: `Upper Threshold (+${threshold}σ)`,
                        data: Array(data.length).fill(mean + threshold * std),
                        borderColor: 'rgba(245,158,11,0.5)', borderDash: [8, 4],
                        borderWidth: 1, fill: false, pointRadius: 0
                    },
                    {
                        label: `Lower Threshold (-${threshold}σ)`,
                        data: Array(data.length).fill(Math.max(0, mean - threshold * std)),
                        borderColor: 'rgba(245,158,11,0.5)', borderDash: [8, 4],
                        borderWidth: 1, fill: false, pointRadius: 0
                    }
                ]
            },
            options: {
                ...chartDefaults('Consumption (units)'),
                plugins: {
                    ...chartDefaults().plugins,
                    annotation: undefined
                }
            }
        });

        // Summary stats
        const trend = data[data.length - 1] > data[0] ? '📈 Increasing' : '📉 Decreasing';
        const cv = std > 0 ? ((std / mean) * 100).toFixed(1) : '0';
        document.getElementById('stat-summary').innerHTML = `
      <div class="stat-row"><span class="s-label">Mean Demand</span><span class="s-value">${mean.toFixed(1)} units/day</span></div>
      <div class="stat-row"><span class="s-label">Std Dev (σ)</span><span class="s-value">${std.toFixed(2)}</span></div>
      <div class="stat-row"><span class="s-label">Coeff. of Variation</span><span class="s-value">${cv}%</span></div>
      <div class="stat-row"><span class="s-label">Min / Max</span><span class="s-value">${min} / ${max}</span></div>
      <div class="stat-row"><span class="s-label">Anomalies Found</span><span class="s-value" style="color:${anomalies.length ? 'var(--danger)' : 'var(--success)'}">${anomalies.length}</span></div>
      <div class="stat-row"><span class="s-label">Trend</span><span class="s-value">${trend}</span></div>
    `;

        // Anomaly list
        const listEl = document.getElementById('anomaly-list');
        if (anomalies.length === 0) {
            listEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--success)">✓ No anomalies detected at ${threshold}σ threshold</div>`;
        } else {
            listEl.innerHTML = anomalies.map(a => {
                const severity = Math.abs(a.z) > 3 ? 'CRITICAL' : 'HIGH';
                const sColor = severity === 'CRITICAL' ? '#f87171' : '#fcd34d';
                return `<div class="anomaly-item">
          <svg class="anomaly-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <div class="anomaly-info">
            <div class="a-day">Day ${a.index + 1} — ${a.value.toLocaleString()} units consumed</div>
            <div class="a-detail">Expected range: ${Math.round(Math.max(0, mean - threshold * std))}–${Math.round(mean + threshold * std)} units | Severity: <span style="color:${sColor}">${severity}</span></div>
          </div>
          <div class="anomaly-z">z = ${a.z > 0 ? '+' : ''}${a.z}</div>
        </div>`;
            }).join('');
        }

        return anomalies.length;
    }

    function renderAnalyzerStockLevels() {
        const el = document.getElementById('analyzer-stock-levels');
        if (!el) return;
        const products = DB.getProducts();
        const maxQty = Math.max(...products.map(p => DB.getStock(p.sku) || 0), 1);
        const catColors = { Electronics: '#6366f1', Pharma: '#10b981', FMCG: '#f59e0b', Industrial: '#38bdf8', Apparel: '#ec4899' };
        el.innerHTML = products.map(p => {
            const qty = DB.getStock(p.sku) || 0;
            const pct = Math.round((qty / maxQty) * 100);
            const color = catColors[p.category] || '#8b5cf6';
            return `<div class="stock-level-item">
              <div class="slevel-name" title="${p.name}">${p.name}</div>
              <div class="slevel-bar-wrap"><div class="slevel-bar" style="width:${pct}%;background:${color}"></div></div>
              <div class="slevel-qty">${qty.toLocaleString()}</div>
            </div>`;
        }).join('');
    }

    function init() {
        populateSKUDropdown();
        const firstSKU = document.getElementById('analyzer-sku').value;
        if (firstSKU) runAnalysis(firstSKU);
        renderAnalyzerStockLevels();
    }

    function getAnomalyCount() {
        let total = 0;
        const threshold = parseFloat(document.getElementById('z-threshold')?.value) || 2.0;
        DB.getProducts().forEach(p => {
            const data = DB.getConsumptionHistory(p.sku);
            const { mean, std } = stats(data);
            data.forEach(v => {
                if (Math.abs((v - mean) / (std || 1)) > threshold) total++;
            });
        });
        return total;
    }

    return { init, runAnalysis, getAnomalyCount, detectAnomalies, stats };
})();

function runAnalysis(sku) { Analyzer.runAnalysis(sku); }
