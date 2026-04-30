const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/connection');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/customers  – Staff ve todos los clientes
router.get('/', authenticate, authorize('operator','manager','admin'), async (req, res, next) => {
  const { search, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  let where = ['1=1'];
  const params = [];

  if (search) {
    where.push('(c.first_name LIKE ? OR c.last_name LIKE ? OR u.email LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  try {
    const [rows] = await db.query(
      `SELECT c.*, u.email, u.active, u.created_at AS registered_at
       FROM customers c
       JOIN users u ON u.id = c.user_id
       WHERE ${where.join(' AND ')}
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM customers c JOIN users u ON u.id = c.user_id WHERE ${where.join(' AND ')}`,
      params
    );
    res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// GET /api/customers/:id
router.get('/:id', authenticate, async (req, res, next) => {
  // El cliente solo puede ver su propio perfil
  const isStaff = ['operator','manager','admin'].includes(req.user.role);
  try {
    const [rows] = await db.query(
      `SELECT c.*, u.email, u.role, u.active, u.created_at AS registered_at
       FROM customers c
       JOIN users u ON u.id = c.user_id
       WHERE c.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    if (!isStaff && rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/customers/:id  – Actualizar datos del cliente
router.put('/:id', authenticate,
  body('first_name').optional().notEmpty().trim(),
  body('last_name').optional().notEmpty().trim(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const isStaff = ['operator','manager','admin'].includes(req.user.role);
    try {
      const [rows] = await db.query('SELECT user_id FROM customers WHERE id = ?', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
      if (!isStaff && rows[0].user_id !== req.user.id) {
        return res.status(403).json({ error: 'Acceso denegado' });
      }

      const allowed = ['first_name','last_name','phone','address','city','postal_code','nif','notes'];
      const fields  = Object.keys(req.body).filter(k => allowed.includes(k));
      if (!fields.length) return res.status(400).json({ error: 'Sin campos para actualizar' });

      const set    = fields.map(f => `${f} = ?`).join(', ');
      const values = fields.map(f => req.body[f]);
      await db.query(`UPDATE customers SET ${set} WHERE id = ?`, [...values, req.params.id]);
      res.json({ message: 'Cliente actualizado' });
    } catch (err) { next(err); }
  }
);

// PATCH /api/customers/:id/active  – Activar/desactivar (admin)
router.patch('/:id/active', authenticate, authorize('manager','admin'),
  body('active').isBoolean(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const [rows] = await db.query('SELECT user_id FROM customers WHERE id = ?', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
      await db.query('UPDATE users SET active = ? WHERE id = ?', [req.body.active ? 1 : 0, rows[0].user_id]);
      res.json({ message: 'Estado actualizado' });
    } catch (err) { next(err); }
  }
);

// GET /api/customers/:id/orders  – Historial de pedidos del cliente
router.get('/:id/orders', authenticate, async (req, res, next) => {
  const isStaff = ['operator','manager','admin'].includes(req.user.role);
  try {
    const [customer] = await db.query('SELECT user_id FROM customers WHERE id = ?', [req.params.id]);
    if (!customer.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    if (!isStaff && customer[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const [rows] = await db.query(
      `SELECT o.*, co.name AS country_name,
              of.price AS offer_price, of.status AS offer_status,
              p.status AS payment_status, p.amount AS payment_amount,
              s.status AS shipment_status, s.tracking_number
       FROM orders o
       LEFT JOIN countries  co ON co.id = o.country_id
       LEFT JOIN offers     of ON of.order_id = o.id
       LEFT JOIN payments   p  ON p.order_id = o.id
       LEFT JOIN shipments  s  ON s.order_id = o.id
       WHERE o.customer_id = ?
       ORDER BY o.created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/customers/:id/payments  – Historial de pagos
router.get('/:id/payments', authenticate, async (req, res, next) => {
  const isStaff = ['operator','manager','admin'].includes(req.user.role);
  try {
    const [customer] = await db.query('SELECT user_id FROM customers WHERE id = ?', [req.params.id]);
    if (!customer.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    if (!isStaff && customer[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    const [rows] = await db.query(
      'SELECT * FROM payments WHERE customer_id = ? ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
