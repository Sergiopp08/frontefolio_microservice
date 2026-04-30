const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/connection');
const { authenticate, authorize } = require('../middleware/auth');

const VALID_STATUSES = [
  'pending_review','searching_supplier','offer_sent','offer_accepted',
  'offer_rejected','processing','shipped','in_customs','delivered','cancelled'
];

// GET /api/orders  – Staff ve todos; cliente ve los suyos
router.get('/', authenticate, async (req, res, next) => {
  const isStaff = ['operator','manager','admin'].includes(req.user.role);
  const { status, customer_id, assigned_staff_id, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  let where = ['1=1'];
  const params = [];

  if (!isStaff) {
    // Obtener customer_id del token
    const [cust] = await db.query('SELECT id FROM customers WHERE user_id = ?', [req.user.id]);
    if (!cust.length) return res.status(403).json({ error: 'No eres cliente' });
    where.push('o.customer_id = ?');
    params.push(cust[0].id);
  } else {
    if (customer_id)      { where.push('o.customer_id = ?');       params.push(customer_id); }
    if (assigned_staff_id){ where.push('o.assigned_staff_id = ?'); params.push(assigned_staff_id); }
  }
  if (status) { where.push('o.status = ?'); params.push(status); }

  try {
    const [rows] = await db.query(
      `SELECT o.*,
              CONCAT(c.first_name,' ',c.last_name) AS customer_name,
              co.name AS country_name,
              CONCAT(s.first_name,' ',s.last_name) AS assigned_staff_name,
              of.price AS offer_price, of.status AS offer_status,
              p.status AS payment_status,
              sh.status AS shipment_status, sh.tracking_number
       FROM orders o
       LEFT JOIN customers c  ON c.id = o.customer_id
       LEFT JOIN countries  co ON co.id = o.country_id
       LEFT JOIN staff      s  ON s.id = o.assigned_staff_id
       LEFT JOIN offers     of ON of.order_id = o.id
       LEFT JOIN payments   p  ON p.order_id = o.id
       LEFT JOIN shipments  sh ON sh.order_id = o.id
       WHERE ${where.join(' AND ')}
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM orders o WHERE ${where.join(' AND ')}`,
      params
    );
    res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// GET /api/orders/:id
router.get('/:id', authenticate, async (req, res, next) => {
  const isStaff = ['operator','manager','admin'].includes(req.user.role);
  try {
    const [rows] = await db.query(
      `SELECT o.*,
              c.first_name, c.last_name, c.user_id AS customer_user_id,
              co.name AS country_name,
              of.id AS offer_id, of.price AS offer_price, of.currency AS offer_currency,
              of.description AS offer_description, of.valid_until, of.status AS offer_status,
              p.id AS payment_id, p.status AS payment_status, p.amount AS payment_amount,
              sh.id AS shipment_id, sh.status AS shipment_status, sh.tracking_number, sh.carrier,
              sh.estimated_delivery, sh.tracking_url
       FROM orders o
       LEFT JOIN customers  c  ON c.id = o.customer_id
       LEFT JOIN countries  co ON co.id = o.country_id
       LEFT JOIN offers     of ON of.order_id = o.id
       LEFT JOIN payments   p  ON p.order_id = o.id
       LEFT JOIN shipments  sh ON sh.order_id = o.id
       WHERE o.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (!isStaff && rows[0].customer_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/orders  – El cliente crea una solicitud de producto
router.post('/', authenticate, authorize('customer'),
  body('product_description').notEmpty().trim(),
  body('country_id').isInt(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { product_description, country_id, product_id, notes } = req.body;
    try {
      const [cust] = await db.query('SELECT id FROM customers WHERE user_id = ?', [req.user.id]);
      if (!cust.length) return res.status(400).json({ error: 'Perfil de cliente no encontrado' });

      const [result] = await db.query(
        'INSERT INTO orders (customer_id, product_description, country_id, product_id, notes) VALUES (?,?,?,?,?)',
        [cust[0].id, product_description, country_id, product_id || null, notes || null]
      );
      res.status(201).json({ id: result.insertId, message: 'Solicitud creada correctamente' });
    } catch (err) { next(err); }
  }
);

// PUT /api/orders/:id/status  – Staff actualiza el estado
router.put('/:id/status', authenticate, authorize('operator','manager','admin'),
  body('status').isIn(VALID_STATUSES),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const [result] = await db.query(
        'UPDATE orders SET status = ?, notes = COALESCE(?, notes) WHERE id = ?',
        [req.body.status, req.body.notes || null, req.params.id]
      );
      if (!result.affectedRows) return res.status(404).json({ error: 'Pedido no encontrado' });
      res.json({ message: 'Estado actualizado' });
    } catch (err) { next(err); }
  }
);

// PUT /api/orders/:id/assign  – Asignar operador al pedido
router.put('/:id/assign', authenticate, authorize('manager','admin'),
  body('staff_id').isInt(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      await db.query('UPDATE orders SET assigned_staff_id = ? WHERE id = ?', [req.body.staff_id, req.params.id]);
      res.json({ message: 'Operador asignado' });
    } catch (err) { next(err); }
  }
);

// PUT /api/orders/:id/supplier  – Asignar proveedor al pedido
router.put('/:id/supplier', authenticate, authorize('operator','manager','admin'),
  body('supplier_id').isInt(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      await db.query('UPDATE orders SET supplier_id = ? WHERE id = ?', [req.body.supplier_id, req.params.id]);
      res.json({ message: 'Proveedor asignado' });
    } catch (err) { next(err); }
  }
);

// DELETE /api/orders/:id  – Cancelar pedido
router.delete('/:id', authenticate, async (req, res, next) => {
  const isStaff = ['operator','manager','admin'].includes(req.user.role);
  try {
    const [rows] = await db.query(
      'SELECT o.status, c.user_id FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (!isStaff && rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Acceso denegado' });

    const cancellableStatuses = ['pending_review','searching_supplier','offer_sent'];
    if (!isStaff && !cancellableStatuses.includes(rows[0].status)) {
      return res.status(400).json({ error: 'No se puede cancelar en el estado actual' });
    }
    await db.query('UPDATE orders SET status = "cancelled" WHERE id = ?', [req.params.id]);
    res.json({ message: 'Pedido cancelado' });
  } catch (err) { next(err); }
});

module.exports = router;
