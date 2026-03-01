/**
 * tracker.js — Stock Tracker Module
 * Atomic updates, ACID transaction simulation, ledger rendering
 */

const Tracker = (() => {

    function populateSKUDropdown(selectId) {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        sel.innerHTML = '';
        DB.getProducts().forEach(p => {
            const o = document.createElement('option');
            o.value = p.sku;
            o.textContent = `${p.sku} — ${p.name}`;
            sel.appendChild(o);
        });
    }

    function renderTransactionLedger() {
        const tbody = document.getElementById('txn-tbody');
        if (!tbody) return;
        const txns = DB.getTransactions().slice(0, 50);
        tbody.innerHTML = txns.map(t => {
            const typeClass = t.type === 'IN' ? 'badge-success' : t.type === 'OUT' ? 'badge-danger' : 'badge-warning';
            const typeLabel = t.type === 'IN' ? '▲ IN' : t.type === 'OUT' ? '▼ OUT' : '⟳ ADJ';
            const dt = new Date(t.timestamp);
            const ts = `${dt.toLocaleDateString('en-IN')} ${dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
            return `<tr>
        <td class="mono" style="color:var(--accent-light)">${t.txId}</td>
        <td style="color:var(--text-secondary);font-size:0.78rem">${ts}</td>
        <td class="mono">${t.sku}</td>
        <td><span class="badge ${typeClass}">${typeLabel}</span></td>
        <td class="mono" style="font-weight:700">${t.qty.toLocaleString()}</td>
        <td class="mono" style="color:var(--text-secondary)">${t.balance.toLocaleString()}</td>
        <td style="font-size:0.78rem;color:var(--text-secondary)">${t.ref || '—'}</td>
        <td><span class="badge badge-success">✓ COMMITTED</span></td>
      </tr>`;
        }).join('');
    }

    function renderStockLevels() {
        const container = document.getElementById('stock-levels-list');
        if (!container) return;
        const products = DB.getProducts();
        const allStock = DB.getAllStock();
        container.innerHTML = products.map(p => {
            const qty = allStock[p.sku] || 0;
            const maxExpected = Math.ceil(p.annualDemand / 12); // ~1 month supply
            const pct = Math.min(100, Math.round((qty / maxExpected) * 100));
            let barColor = 'var(--success)';
            let level = 'OK';
            if (pct < 20) { barColor = 'var(--danger)'; level = '⚠ LOW'; }
            else if (pct < 40) { barColor = 'var(--warning)'; level = '! WATCH'; }
            return `<div class="stock-level-item">
        <div class="slevel-name" title="${p.name}">${p.name.slice(0, 18)}${p.name.length > 18 ? '…' : ''}</div>
        <div class="slevel-bar-wrap">
          <div class="slevel-bar" style="width:${pct}%;background:${barColor}"></div>
        </div>
        <div class="slevel-qty" style="color:${barColor}">${qty.toLocaleString()} ${level}</div>
      </div>`;
        }).join('');
    }

    function recordTransaction() {
        const sku = document.getElementById('txn-sku').value;
        const type = document.querySelector('input[name="txn-type"]:checked').value;
        const qty = parseInt(document.getElementById('txn-qty').value);
        const ref = document.getElementById('txn-ref').value || '';
        const batch = document.getElementById('txn-batch').value || '';
        const resultEl = document.getElementById('txn-result');

        // Validation
        if (!sku || !qty || qty <= 0) {
            resultEl.className = 'txn-result error';
            resultEl.textContent = '⚠ Invalid input — please select a SKU and enter a valid quantity.';
            return;
        }

        // BEGIN TRANSACTION
        const delta = type === 'IN' ? qty : -qty;
        const stockResult = DB.updateStock(sku, delta, type);

        if (!stockResult.ok) {
            // ROLLBACK
            resultEl.className = 'txn-result error';
            resultEl.textContent = `✗ TRANSACTION ROLLED BACK — ${stockResult.msg}`;
            return;
        }

        // Track consumption for outbound
        if (type === 'OUT') DB.addConsumption(sku, qty);

        // COMMIT
        const txn = DB.addTransaction({ sku, type, qty, ref, batch, balance: stockResult.after });

        resultEl.className = 'txn-result success';
        resultEl.textContent = `✓ COMMITTED — ${txn.txId} | ${sku} ${type} ${qty} units | New balance: ${stockResult.after.toLocaleString()}`;

        // Clear form
        document.getElementById('txn-qty').value = '';
        document.getElementById('txn-ref').value = '';
        document.getElementById('txn-batch').value = '';

        // Re-render
        renderTransactionLedger();
        renderStockLevels();
        updateDashboardKPIs();
        renderActivityList();

        showToast(`Stock ${type}: ${qty} units of ${sku}`, 'success');
    }

    function init() {
        populateSKUDropdown('txn-sku');
        renderTransactionLedger();
        renderStockLevels();
    }

    return { init, renderTransactionLedger, renderStockLevels, recordTransaction, populateSKUDropdown };
})();

// Expose globally
function recordTransaction() { Tracker.recordTransaction(); }
