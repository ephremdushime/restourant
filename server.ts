import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '15mb' }));

// Server-side persistent storage
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let serverDbState: any = null;

if (fs.existsSync(DB_FILE)) {
  try {
    serverDbState = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    console.log('Loaded shared server state from db.json');
  } catch (e) {
    console.error('Error reading db.json:', e);
  }
}

// API Health Check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

// GET shared database state
app.get('/api/state', (_req, res) => {
  res.json({
    success: true,
    hasServerState: !!serverDbState,
    state: serverDbState,
  });
});

// POST /api/state: Save entire app state from laptop or phone
app.post('/api/state', (req, res) => {
  const incoming = req.body;
  if (!incoming || typeof incoming !== 'object') {
    return res.status(400).json({ success: false, error: 'Invalid payload' });
  }

  serverDbState = incoming;
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(serverDbState, null, 2));
  } catch (e) {
    console.error('Error persisting db.json:', e);
  }

  return res.json({ success: true, savedAt: new Date().toISOString() });
});

// POST /api/sync: Incremental or full synchronization
app.post('/api/sync', (req, res) => {
  const { fullState } = req.body;

  if (fullState && typeof fullState === 'object') {
    // If incoming state is newer or contains more ledger entries/customers, merge
    if (!serverDbState) {
      serverDbState = fullState;
    } else {
      // Merge customers by ID (union of both)
      const existingCustIds = new Set((serverDbState.customers || []).map((c: any) => c.id));
      const incomingCustomers = fullState.customers || [];
      const newCustomers = incomingCustomers.filter((c: any) => !existingCustIds.has(c.id));
      serverDbState.customers = [...(serverDbState.customers || []), ...newCustomers];

      // Merge ledger entries (append-only)
      const existingLedgerIds = new Set((serverDbState.ledgerEntries || []).map((l: any) => l.id));
      const incomingLedgers = fullState.ledgerEntries || [];
      const newLedgers = incomingLedgers.filter((l: any) => !existingLedgerIds.has(l.id));
      serverDbState.ledgerEntries = [...(serverDbState.ledgerEntries || []), ...newLedgers];

      // Merge scan events
      const existingScanIds = new Set((serverDbState.scanEvents || []).map((s: any) => s.id));
      const incomingScans = fullState.scanEvents || [];
      const newScans = incomingScans.filter((s: any) => !existingScanIds.has(s.id));
      serverDbState.scanEvents = [...newScans, ...(serverDbState.scanEvents || [])];

      // Merge notifications (by ID)
      const existingNotifIds = new Set((serverDbState.notifications || []).map((n: any) => n.id));
      const incomingNotifs = fullState.notifications || [];
      const newNotifs = incomingNotifs.filter((n: any) => !existingNotifIds.has(n.id));
      serverDbState.notifications = [...newNotifs, ...(serverDbState.notifications || [])];

      // Merge checkouts/outbox
      serverDbState.syncOutbox = fullState.syncOutbox || serverDbState.syncOutbox;
    }

    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(serverDbState, null, 2));
    } catch (e) {
      console.error('Error saving db.json:', e);
    }

    return res.json({
      success: true,
      serverState: serverDbState,
      serverTime: new Date().toISOString(),
    });
  }

  return res.json({
    success: true,
    serverState: serverDbState,
    serverTime: new Date().toISOString(),
  });
});

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RestoPass Full-Stack Cloud Authority listening on port ${PORT}`);
  });
}

startServer();
