/**
 * reporting.js — Reorder Alerts & Full Reporting Module
 * Threshold monitoring, health scoring, alert classification, CSV export
 */

const Reporting = (() => {
    let reorderChart = null;

    // ===== HEALTH SCORE ALGORITHM =====
    // Score = weighted average of: stock coverage, anomaly rate, reorder status
    function computeHealthScore(sku) {
        const p = DB.getProduct(sku);
        if (!p) return { score: 0, grade: 'D' };

        const qty = DB.getStock(sku);
        const dailyDemand = p.annualDemand / 365;
        const coverageDays = dailyDemand > 0 ? qty / dailyDemand : 0;

        // 1. Stock Coverage Score (0–40): ideal = 30 days
        const coverageScore = Math.min(40, (coverageDays / 30) * 40);

        // 2. Anomaly Score (0–30): fewer anomalies = higher score
        const history = DB.getConsumptionHistory(sku);
        const { mean, std } = Analyzer.stats(history);
        const anomalies = history.filter(v => Math.abs((v - mean) / (std || 1)) > 2.0);
        const anomalyScore = Math.max(0, 30 - (anomalies.length / history.length) * 100);

        // 3. Supplier Score (0–30): based on lead time reasonableness
        const leadScore = Math.max(0, 30 - p.leadTime);

        const total = Math.round(coverageScore + anomalyScore + leadScore);
        const grade = total >= 80 ? 'A' : total >= 65 ? 'B' : total >= 50 ? 'C' : 'D';
        return { score: Math.min(100, total), grade, coverageDays: coverageDays.toFixed(1) };
    }

    // ===== REORDER ALERT CLASSIFICATION =====
    function classifyAlerts() {
        const products = DB.getProducts();
        const rops = Optimizer.getROP();
        const alerts = products.map(p => {
            const qty = DB.getStock(p.sku);
            const dailyDmd = p.annualDemand / 365;
            const rop = rops[p.sku] || Math.ceil(dailyDmd * p.leadTime * 1.5);
            const maxStock = Math.ceil(dailyDmd * 60); // 60-day max
            const pct = maxStock > 0 ? Math.min(100, Math.round((qty / maxStock) * 100)) : 100;

            let severity = 'ok', sevLabel = '✓ OK';
            if (qty === 0) { severity = 'critical'; sevLabel = '🚨 STOCKOUT'; }
            else if (qty <= rop * 0.5) { severity = 'critical'; sevLabel = '🔴 CRITICAL'; }
            else if (qty <= rop) { severity = 'warning'; sevLabel = '🟡 ORDER NOW'; }

            return { ...p, qty, rop, pct, severity, sevLabel, dailyDmd: dailyDmd.toFixed(1) };
        });
        return alerts.sort((a, b) => {
            const order = { critical: 0, warning: 1, ok: 2 };
            return order[a.severity] - order[b.severity];
        });
    }

    function renderAlerts() {
        const alerts = classifyAlerts();
        const list = document.getElementById('reorder-alerts-list');
        if (!list) return;

        const critical = alerts.filter(a => a.severity === 'critical').length;
        const warning = alerts.filter(a => a.severity === 'warning').length;
        const ok = alerts.filter(a => a.severity === 'ok').length;

        // KPI summary
        const summary = document.getElementById('alert-summary');
        if (summary) {
            summary.innerHTML = `
        <div class="alert-stat-card">
          <div class="alert-stat-icon">🚨</div>
          <div class="alert-stat-info">
            <div class="a-num" style="color:#f87171">${critical}</div>
            <div class="a-lbl">Critical / Stockout</div>
          </div>
        </div>
        <div class="alert-stat-card">
          <div class="alert-stat-icon">🟡</div>
          <div class="alert-stat-info">
            <div class="a-num" style="color:#fcd34d">${warning}</div>
            <div class="a-lbl">Reorder Required</div>
          </div>
        </div>
        <div class="alert-stat-card">
          <div class="alert-stat-icon">✅</div>
          <div class="alert-stat-info">
            <div class="a-num" style="color:#34d399">${ok}</div>
            <div class="a-lbl">Adequately Stocked</div>
          </div>
        </div>
      `;
        }

        // Alert cards
        list.innerHTML = alerts.map(a => {
            const barColor = a.severity === 'critical' ? '#ef4444' : a.severity === 'warning' ? '#f59e0b' : '#10b981';
            const daysLeft = a.dailyDmd > 0 ? Math.floor(a.qty / parseFloat(a.dailyDmd)) : '∞';
            return `<div class="reorder-alert ${a.severity}">
        <div class="ra-top">
          <div>
            <div class="ra-sku">${a.sku}</div>
            <div class="ra-name">${a.name}</div>
          </div>
          <span class="badge ${a.severity === 'critical' ? 'badge-danger' : a.severity === 'warning' ? 'badge-warning' : 'badge-success'}">${a.sevLabel}</span>
        </div>
        <div class="ra-detail">
          Stock: <strong>${a.qty.toLocaleString()}</strong> ${a.unit} | ROP: ${a.rop.toLocaleString()} | Avg demand: ${a.dailyDmd}/day | <strong>${daysLeft} days left</strong>
        </div>
        <div class="ra-progress">
          <div class="ra-fill" style="width:${a.pct}%;background:${barColor}"></div>
        </div>
      </div>`;
        }).join('');

        // Update global alert badge
        const totalAlerts = critical + warning;
        document.getElementById('alert-count').textContent = totalAlerts;

        // Reorder chart
        renderReorderChart(alerts);

        // Health scores
        renderHealthScores();
    }

    function renderReorderChart(alerts) {
        if (reorderChart) reorderChart.destroy();
        const ctx = document.getElementById('reorder-chart');
        if (!ctx) return;

        const labels = alerts.map(a => a.sku);
        const stock = alerts.map(a => a.qty);
        const rops = alerts.map(a => a.rop);
        const colors = alerts.map(a =>
            a.severity === 'critical' ? 'rgba(239,68,68,0.7)' :
                a.severity === 'warning' ? 'rgba(245,158,11,0.7)' :
                    'rgba(16,185,129,0.7)'
        );

        reorderChart = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Current Stock',
                        data: stock,
                        backgroundColor: colors,
                        borderColor: colors.map(c => c.replace(',0.7)', ',1)')),
                        borderWidth: 1,
                        borderRadius: 4,
                    },
                    {
                        label: 'Reorder Point',
                        data: rops,
                        type: 'line',
                        borderColor: '#f59e0b',
                        backgroundColor: 'transparent',
                        borderWidth: 2, borderDash: [5, 3],
                        pointRadius: 5, pointBackgroundColor: '#f59e0b',
                    }
                ]
            },
            options: {
                ...chartDefaults('Units'),
                scales: {
                    ...chartDefaults('Units').scales,
                    x: { ...chartDefaults('Units').scales.x, ticks: { ...chartDefaults('Units').scales.x.ticks, font: { size: 10 } } }
                }
            }
        });
    }

    function renderHealthScores() {
        const container = document.getElementById('health-scores');
        if (!container) return;
        const products = DB.getProducts();
        const htmlArr = products.map(p => {
            const { score, grade, coverageDays } = computeHealthScore(p.sku);
            return `<div class="health-item">
        <div class="health-name">${p.name.slice(0, 22)}${p.name.length > 22 ? '…' : ''}</div>
        <div class="health-score score-${grade}">${grade} <span style="font-size:0.85rem;color:var(--text-secondary)">(${score}/100)</span></div>
        <div style="font-size:0.72rem;color:var(--text-muted)">${coverageDays} days coverage</div>
      </div>`;
        });
        container.innerHTML = `<div class="health-grid">${htmlArr.join('')}</div>`;
    }

    function generateReport() {
        const alerts = classifyAlerts();
        const rops = Optimizer.getROP();
        const rows = alerts.map(a => {
            const { score, grade } = computeHealthScore(a.sku);
            return `<tr>
        <td class="mono" style="color:var(--accent-light)">${a.sku}</td>
        <td>${a.name}</td>
        <td><span class="badge badge-info">${a.category}</span></td>
        <td>${a.supplier}</td>
        <td class="mono" style="font-weight:700">${a.qty.toLocaleString()}</td>
        <td class="mono">${a.rop.toLocaleString()}</td>
        <td class="mono">₹${(a.qty * a.unitCost).toLocaleString('en-IN')}</td>
        <td>${a.dailyDmd}/day</td>
        <td><span class="badge ${a.severity === 'critical' ? 'badge-danger' : a.severity === 'warning' ? 'badge-warning' : 'badge-success'}">${a.sevLabel}</span></td>
        <td><span class="health-score score-${grade}" style="font-size:0.9rem">${grade} (${score})</span></td>
      </tr>`;
        });

        document.getElementById('full-report-table').innerHTML = `
      <div class="table-wrap" style="max-height:400px;overflow-y:auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>SKU</th><th>Product</th><th>Category</th><th>Supplier</th>
              <th>Current Stock</th><th>Reorder Point</th><th>Value (₹)</th>
              <th>Avg Demand</th><th>Alert Status</th><th>Health</th>
            </tr>
          </thead>
          <tbody>${rows.join('')}</tbody>
        </table>
      </div>
    `;
        showToast('Report generated successfully', 'success');
    }

    function exportCSV() {
        const alerts = classifyAlerts();
        const headers = ['SKU', 'Product Name', 'Category', 'Supplier', 'Current Stock', 'Unit', 'Unit Cost (INR)', 'Reorder Point', 'Daily Demand', 'Alert Status'];
        const rows = alerts.map(a => [
            a.sku, `"${a.name}"`, a.category, `"${a.supplier}"`,
            a.qty, a.unit, a.unitCost, a.rop, a.dailyDmd, a.sevLabel.replace(/[🚨🔴🟡✓]/g, '')
        ].join(','));

        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `inventory_report_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click(); URL.revokeObjectURL(url);
        showToast('CSV exported successfully', 'info');
    }

    function init() {
        renderAlerts();
    }

    function getAlertCount() {
        const alerts = classifyAlerts();
        return alerts.filter(a => a.severity !== 'ok').length;
    }

    return { init, renderAlerts, generateReport, exportCSV, getAlertCount };
})();

function generateReport() { Reporting.generateReport(); }
function exportCSV() { Reporting.exportCSV(); }
