require('dotenv').config();
const express      = require('express');
const helmet       = require('helmet');
const morgan       = require('morgan');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/inventory',  require('./routes/inventory'));
app.use('/api/countries',  require('./routes/countries'));
app.use('/api/suppliers',  require('./routes/suppliers'));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'catalog-service', mensaje: 'hola', timestamp: new Date().toISOString() }));
app.use((req, res) => res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` }));
app.use(errorHandler);

module.exports = app;
