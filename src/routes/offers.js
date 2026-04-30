const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/connection');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/offers  – Staff lista todas; cliente ve las suyas
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
  if (status) { where.push('of.status = ?'); params.push(status); }

  try {
    const [rows] = await db.query(
      `SELECT of.*, o.product_description, o.status AS order_status,
              CONCAT(c.first_name,' ',c.last_name) AS customer_name
       FROM offers of
       JOIN orders   o ON o.id = of.order_id
       JOIN customers c ON c.id = o.customer_id
       WHERE ${where.join(' AND ')}
       ORDER BY of.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// GET /api/offers/:id
router.get('/:id', authenticate, async (req, res, next) => {
  const isStaff = ['operator','manager','admin'].includes(req.user.role);
  try {
    const [rows] = await db.query(
      `SELECT of.*, o.product_description, o.status AS order_status, c.user_id AS customer_user_id
       FROM offers of
       JOIN orders   o ON o.id = of.order_id
       JOIN customers c ON c.id = o.customer_id
       WHERE of.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Oferta no encontrada' });
    if (!isStaff && rows[0].customer_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/offers  – Staff crea una oferta para un pedido
router.post('/', authenticate, authorize('operator','manager','admin'),
  body('order_id').isInt(),
  body('price').isFloat({ min: 0 }),
  body('valid_until').isISO8601(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { order_id, price, currency, description, valid_until } = req.body;
    try {
      // Verificar que el pedido existe y no tiene ya una oferta activa
      const [order] = await db.query('SELECT id, status FROM orders WHERE id = ?', [order_id]);
      if (!order.length) return res.status(404).json({ error: 'Pedido no encontrado' });

      const [existing] = await db.query('SELECT id FROM offers WHERE order_id = ?', [order_id]);
      if (existing.length) return res.status(409).json({ error: 'El pedido ya tiene una oferta' });

      const conn = await db.getConnection();
      await conn.beginTransaction();
      try {
        const [result] = await conn.query(
          'INSERT INTO offers (order_id, price, currency, description, valid_until) VALUES (?,?,?,?,?)',
          [order_id, price, currency || 'EUR', description || null, valid_until]
        );
        await conn.query('UPDATE orders SET status = "offer_sent" WHERE id = ?', [order_id]);
        await conn.commit();
        conn.release();
        res.status(201).json({ id: result.insertId });
      } catch (e) {
        await conn.rollback();
        conn.release();
        throw e;
      }
    } catch (err) { next(err); }
  }
);

// PUT /api/offers/:id  – Staff actualiza la oferta (antes de que sea aceptada)
router.put('/:id', authenticate, authorize('operator','manager','admin'),
  async (req, res, next) => {
    const allowed = ['price','currency','description','valid_until'];
    const fields  = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!fields.length) return res.status(400).json({ error: 'Sin campos para actualizar' });

    try {
      const [rows] = await db.query('SELECT status FROM offers WHERE id = ?', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Oferta no encontrada' });
      if (rows[0].status !== 'pending') return res.status(400).json({ error: 'Solo se puede editar una oferta pendiente' });

      const set    = fields.map(f => `${f} = ?`).join(', ');
      const values = fields.map(f => req.body[f]);
      await db.query(`UPDATE offers SET ${set} WHERE id = ?`, [...values, req.params.id]);
      res.json({ message: 'Oferta actualizada' });
    } catch (err) { next(err); }
  }
);

// POST /api/offers/:id/accept  – El cliente acepta la oferta
router.post('/:id/accept', authenticate, authorize('customer'), async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT of.*, o.customer_id, c.user_id AS customer_user_id
       FROM offers of
       JOIN orders   o ON o.id = of.order_id
       JOIN customers c ON c.id = o.customer_id
       WHERE of.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Oferta no encontrada' });
    if (rows[0].customer_user_id !== req.user.id) return res.status(403).json({ error: 'Acceso denegado' });
    if (rows[0].status !== 'pending') return res.status(400).json({ error: 'La oferta no está en estado pendiente' });

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      await conn.query('UPDATE offers SET status = "accepted" WHERE id = ?', [req.params.id]);
      await conn.query('UPDATE orders SET status = "offer_accepted" WHERE id = ?', [rows[0].order_id]);
      await conn.commit();
      conn.release();
      res.json({ message: 'Oferta aceptada', order_id: rows[0].order_id });
    } catch (e) {
      await conn.rollback();
      conn.release();
      throw e;
    }
  } catch (err) { next(err); }
});

// POST /api/offers/:id/reject  – El cliente rechaza la oferta
router.post('/:id/reject', authenticate, authorize('customer'), async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT of.*, o.order_id, c.user_id AS customer_user_id
       FROM offers of
       JOIN orders   o ON o.id = of.order_id
       JOIN customers c ON c.id = o.customer_id
       WHERE of.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Oferta no encontrada' });
    if (rows[0].customer_user_id !== req.user.id) return res.status(403).json({ error: 'Acceso denegado' });
    if (rows[0].status !== 'pending') return res.status(400).json({ error: 'La oferta no está en estado pendiente' });

    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      await conn.query('UPDATE offers SET status = "rejected" WHERE id = ?', [req.params.id]);
      await conn.query('UPDATE orders SET status = "offer_rejected" WHERE id = ?', [rows[0].order_id]);
      await conn.commit();
      conn.release();
      res.json({ message: 'Oferta rechazada' });
    } catch (e) {
      await conn.rollback();
      conn.release();
      throw e;
    }
  } catch (err) { next(err); }
});

module.exports = router;
