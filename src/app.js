require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ─── Seguridad & utilidades ────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [
    process.env.FRONTEND_CUSTOMER_URL || 'http://localhost:5173',
    process.env.FRONTEND_ADMIN_URL    || 'http://localhost:5174',
  ],
  credentials: true,
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// El webhook de Stripe necesita el body crudo (antes del JSON parser)
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Rutas ─────────────────────────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/inventory',  require('./routes/inventory'));
app.use('/api/customers',  require('./routes/customers'));
app.use('/api/staff',      require('./routes/staff'));
app.use('/api/orders',     require('./routes/orders'));
app.use('/api/offers',     require('./routes/offers'));
app.use('/api/payments',   require('./routes/payments'));
app.use('/api/shipments',  require('./routes/shipments'));
app.use('/api/chat',       require('./routes/chat'));
app.use('/api/countries',  require('./routes/countries'));
app.use('/api/suppliers',  require('./routes/suppliers'));

// ─── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` }));

// ─── Error handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
