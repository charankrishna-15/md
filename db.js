/**
 * db.js — Product Database Module
 * SKU modeling, normalization, in-memory relational store
 */

const DB = (() => {
  // ===== SCHEMA: Products Table =====
  const products = [
    { sku:'ELEC-001', name:'Laptop 15" Core i5', category:'Electronics', unit:'pcs', unitCost:52000, leadTime:7, supplier:'TechDistrib Pvt Ltd', orderingCost:800, holdingPct:22, annualDemand:240, status:'Active' },
    { sku:'ELEC-002', name:'Wireless Mouse Combo', category:'Electronics', unit:'pcs', unitCost:850, leadTime:3, supplier:'TechDistrib Pvt Ltd', orderingCost:350, holdingPct:20, annualDemand:1200, status:'Active' },
    { sku:'ELEC-003', name:'USB-C Hub 7-Port', category:'Electronics', unit:'pcs', unitCost:1500, leadTime:5, supplier:'HubTech India', orderingCost:450, holdingPct:25, annualDemand:600, status:'Active' },
    { sku:'PHAR-001', name:'Paracetamol 500mg Strip', category:'Pharma', unit:'strips', unitCost:18, leadTime:2, supplier:'MediCorp India', orderingCost:200, holdingPct:30, annualDemand:50000, status:'Active' },
    { sku:'PHAR-002', name:'Hand Sanitiser 500ml', category:'Pharma', unit:'bottles', unitCost:120, leadTime:3, supplier:'CleanCare Ltd', orderingCost:300, holdingPct:28, annualDemand:8000, status:'Active' },
    { sku:'FMCG-001', name:'Biscuit Pack Assorted', category:'FMCG', unit:'cartons', unitCost:480, leadTime:2, supplier:'Snackwell Foods', orderingCost:250, holdingPct:18, annualDemand:3600, status:'Active' },
    { sku:'FMCG-002', name:'Cooking Oil 5L Tin', category:'FMCG', unit:'tins', unitCost:680, leadTime:4, supplier:'GoldenHarvest', orderingCost:400, holdingPct:20, annualDemand:2400, status:'Active' },
    { sku:'INDU-001', name:'Ball Bearing 6204', category:'Industrial', unit:'pcs', unitCost:95, leadTime:10, supplier:'SKF Bearings India', orderingCost:600, holdingPct:15, annualDemand:5000, status:'Active' },
    { sku:'INDU-002', name:'Hydraulic Hose 1/2"', category:'Industrial', unit:'metres', unitCost:220, leadTime:14, supplier:'FluidPower Corp', orderingCost:700, holdingPct:12, annualDemand:1800, status:'Active' },
    { sku:'APRL-001', name:'Safety Gloves Nitrile L', category:'Apparel', unit:'pairs', unitCost:45, leadTime:5, supplier:'SafeGuard PPE', orderingCost:280, holdingPct:25, annualDemand:12000, status:'Active' },
  ];

  // ===== SCHEMA: Stock Table =====
  const stock = {
    'ELEC-001': 87,
    'ELEC-002': 310,
    'ELEC-003': 42,
    'PHAR-001': 8500,
    'PHAR-002': 620,
    'FMCG-001': 180,
    'FMCG-002': 95,
    'INDU-001': 1250,
    'INDU-002': 35,
    'APRL-001': 4400,
  };

  // Consumption history (30 days per SKU) for statistical analysis
  const consumptionHistory = {};
  products.forEach(p => {
    const dailyAvg = p.annualDemand / 365;
    const h = [];
    for (let i = 0; i < 30; i++) {
      // Introduce occasional anomalies
      const isAnomaly = (i === 7 || i === 18 || i === 26);
      const mult = isAnomaly ? (2.8 + Math.random()) : (0.6 + Math.random() * 0.8);
      h.push(Math.round(dailyAvg * mult));
    }
    consumptionHistory[p.sku] = h;
  });

  // Transaction ledger
  const transactions = [];
  let txCounter = 1000;

  // Pre-seed a few transactions
  const seedTxns = [
    { sku:'ELEC-001', type:'IN',  qty:50,   ref:'PO-2024-001', batch:'B001', balance:87 },
    { sku:'PHAR-001', type:'OUT', qty:2000,  ref:'WO-2024-015', batch:'B002', balance:8500 },
    { sku:'FMCG-002', type:'IN',  qty:100,  ref:'PO-2024-002', batch:'B003', balance:95 },
    { sku:'INDU-002', type:'OUT', qty:15,   ref:'WO-2024-016', batch:'B004', balance:35 },
    { sku:'APRL-001', type:'ADJ', qty:50,   ref:'Cycle Count', batch:'',     balance:4400 },
  ];
  const now = Date.now();
  seedTxns.forEach((t, i) => {
    transactions.push({
      txId: `TXN${txCounter++}`,
      timestamp: new Date(now - (seedTxns.length - i) * 3600000 * 4).toISOString(),
      sku: t.sku,
      type: t.type,
      qty: t.qty,
      ref: t.ref,
      batch: t.batch,
      balance: t.balance,
      status: 'COMMITTED'
    });
  });

  // ===== PUBLIC API =====
  return {
    // Products CRUD
    getProducts: (filter = {}) => {
      let res = [...products];
      if (filter.category) res = res.filter(p => p.category === filter.category);
      if (filter.search) {
        const q = filter.search.toLowerCase();
        res = res.filter(p =>
          p.sku.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.supplier.toLowerCase().includes(q)
        );
      }
      return res;
    },
    addProduct: (prod) => {
      if (products.find(p => p.sku === prod.sku)) return { ok: false, msg: 'SKU already exists' };
      products.push({ ...prod, status: 'Active' });
      stock[prod.sku] = 0;
      consumptionHistory[prod.sku] = Array.from({length:30}, () => 0);
      return { ok: true };
    },
    getProduct: (sku) => products.find(p => p.sku === sku),
    getProductCount: () => products.length,

    // Stock CRUD — Atomic update
    getStock: (sku) => stock[sku] ?? 0,
    getAllStock: () => ({ ...stock }),
    updateStock: (sku, delta, type) => {
      // ACID transaction: validate first
      if (type === 'OUT' && stock[sku] < Math.abs(delta)) {
        return { ok: false, msg: `Insufficient stock. Available: ${stock[sku]}` };
      }
      const before = stock[sku] || 0;
      stock[sku] = Math.max(0, before + delta);
      return { ok: true, before, after: stock[sku] };
    },

    // Transaction Ledger
    addTransaction: (txn) => {
      const t = {
        txId: `TXN${txCounter++}`,
        timestamp: new Date().toISOString(),
        ...txn,
        status: 'COMMITTED'
      };
      transactions.unshift(t);
      return t;
    },
    getTransactions: () => [...transactions],

    // Consumption history
    getConsumptionHistory: (sku) => consumptionHistory[sku] ? [...consumptionHistory[sku]] : [],
    addConsumption: (sku, qty) => {
      if (!consumptionHistory[sku]) consumptionHistory[sku] = [];
      consumptionHistory[sku].push(qty);
      if (consumptionHistory[sku].length > 90) consumptionHistory[sku].shift();
    },

    // Inventory value
    getTotalInventoryValue: () => {
      return products.reduce((sum, p) => sum + (stock[p.sku] || 0) * p.unitCost, 0);
    },

    // Low stock: current < 10% of monthly demand
    getLowStockItems: (reorderPoints = {}) => {
      return products.filter(p => {
        const rop = reorderPoints[p.sku] || Math.ceil(p.annualDemand / 365 * p.leadTime * 1.5);
        return (stock[p.sku] || 0) <= rop;
      });
    }
  };
})();
