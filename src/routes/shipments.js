const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/connection');
const { authenticate, authorize } = require('../middleware/auth');

const VALID_STATUSES = ['preparing','picked_up','in_transit','in_customs','out_for_delivery','delivered','returned'];

// GET /api/shipments  – Staff: todos; cliente: los suyos
router.get('/', authenticate, async (req, res, next) => {
  const isStaff = ['operator','manager','admin'].includes(req.user.role);
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  let where = ['1=1'];
  const params = [];

  if (!isStaff) {
    const [cust] = await db.query('SELECT id FROM customers WHERE user_id = ?', [req.user.id]);
    if (!cust.length) return res.status(403).json({ error: 'No eres cliente' });
    where.push('o.customer_id = ?');
    params.push(cust[0].id);
  }
  if (status) { where.push('s.status = ?'); params.push(status); }

  try {
    const [rows] = await db.query(
      `SELECT s.*, o.product_description, o.customer_id,
              co.name AS origin_country_name,
              CONCAT(c.first_name,' ',c.last_name) AS customer_name
       FROM shipments s
       JOIN orders    o  ON o.id = s.order_id
       JOIN customers c  ON c.id = o.customer_id
       LEFT JOIN countries co ON co.id = s.origin_country_id
       WHERE ${where.join(' AND ')}
       ORDER BY s.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM shipments s JOIN orders o ON o.id = s.order_id WHERE ${where.join(' AND ')}`,
      params
    );
    res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// GET /api/shipments/:id
router.get('/:id', authenticate, async (req, res, next) => {
  const isStaff = ['operator','manager','admin'].includes(req.user.role);
  try {
    const [rows] = await db.query(
      `SELECT s.*, o.product_description, c.user_id AS customer_user_id,
              co.name AS origin_country_name
       FROM shipments s
       JOIN orders    o  ON o.id = s.order_id
       JOIN customers c  ON c.id = o.customer_id
       LEFT JOIN countries co ON co.id = s.origin_country_id
       WHERE s.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Envío no encontrado' });
    if (!isStaff && rows[0].customer_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/shipments/order/:order_id  – Envío de un pedido concreto
router.get('/order/:order_id', authenticate, async (req, res, next) => {
  const isStaff = ['operator','manager','admin'].includes(req.user.role);
  try {
    const [rows] = await db.query(
      `SELECT s.*, co.name AS origin_country_name, c.user_id AS customer_user_id
       FROM shipments s
       JOIN orders    o  ON o.id = s.order_id
       JOIN customers c  ON c.id = o.customer_id
       LEFT JOIN countries co ON co.id = s.origin_country_id
       WHERE s.order_id = ?`,
      [req.params.order_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Envío no encontrado' });
    if (!isStaff && rows[0].customer_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/shipments  – Staff crea el envío
router.post('/', authenticate, authorize('operator','manager','admin'),
  body('order_id').isInt(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { order_id, tracking_number, carrier, origin_country_id, estimated_delivery, tracking_url, notes } = req.body;
    try {
      const [existing] = await db.query('SELECT id FROM shipments WHERE order_id = ?', [order_id]);
      if (existing.length) return res.status(409).json({ error: 'El pedido ya tiene un envío registrado' });

      const [result] = await db.query(
        'INSERT INTO shipments (order_id, tracking_number, carrier, origin_country_id, estimated_delivery, tracking_url, notes) VALUES (?,?,?,?,?,?,?)',
        [order_id, tracking_number || null, carrier || null, origin_country_id || null, estimated_delivery || null, tracking_url || null, notes || null]
      );
      await db.query('UPDATE orders SET status = "shipped" WHERE id = ?', [order_id]);
      res.status(201).json({ id: result.insertId });
    } catch (err) { next(err); }
  }
);

// PUT /api/shipments/:id/status  – Actualizar estado del envío
router.put('/:id/status', authenticate, authorize('operator','manager','admin'),
  body('status').isIn(VALID_STATUSES),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { status, notes, tracking_number, carrier, estimated_delivery, tracking_url } = req.body;
    try {
      const [rows] = await db.query('SELECT order_id FROM shipments WHERE id = ?', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Envío no encontrado' });

      const fields = { status };
      if (notes)             fields.notes = notes;
      if (tracking_number)   fields.tracking_number = tracking_number;
      if (carrier)           fields.carrier = carrier;
      if (estimated_delivery) fields.estimated_delivery = estimated_delivery;
      if (tracking_url)      fields.tracking_url = tracking_url;
      if (status === 'delivered') fields.actual_delivery = new Date();

      const set    = Object.keys(fields).map(f => `${f} = ?`).join(', ');
      const values = Object.values(fields);
      await db.query(`UPDATE shipments SET ${set} WHERE id = ?`, [...values, req.params.id]);

      // Sincronizar estado del pedido
      const orderStatusMap = {
        preparing:        'processing',
        picked_up:        'processing',
        in_transit:       'shipped',
        in_customs:       'in_customs',
        out_for_delivery: 'shipped',
        delivered:        'delivered',
        returned:         'processing',
      };
      if (orderStatusMap[status]) {
        await db.query('UPDATE orders SET status = ? WHERE id = ?', [orderStatusMap[status], rows[0].order_id]);
      }

      res.json({ message: 'Estado de envío actualizado' });
    } catch (err) { next(err); }
  }
);

module.exports = router;
