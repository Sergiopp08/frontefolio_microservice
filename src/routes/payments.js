const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/connection');
const { authenticate, authorize } = require('../middleware/auth');

// Tarjetas válidas definidas en .env como lista separada por comas
// Ej: VALID_CARDS=4111111111111111,5500005555555554
function getValidCards() {
  return (process.env.VALID_CARDS || '')
    .split(',')
    .map(c => c.trim())
    .filter(Boolean);
}

// POST /api/payments/pay  – El cliente paga introduciendo su tarjeta
router.post('/pay', authenticate, authorize('customer'),
  body('order_id').isInt(),
  body('card_number').notEmpty().trim(),
  body('card_expiry').notEmpty().trim(),   // formato MM/YY
  body('card_cvv').notEmpty().trim(),
  body('card_holder').notEmpty().trim(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { order_id, card_number, card_expiry, card_cvv, card_holder } = req.body;

    try {
      // Verificar que la oferta está aceptada y pertenece al cliente
      const [rows] = await db.query(
        `SELECT o.id AS order_id, o.product_description, o.status AS order_status,
                of.price, of.currency, of.status AS offer_status,
                c.id AS customer_id, c.user_id
         FROM orders o
         JOIN offers    of ON of.order_id = o.id
         JOIN customers c  ON c.id = o.customer_id
         WHERE o.id = ?`,
        [order_id]
      );

      if (!rows.length) return res.status(404).json({ error: 'Pedido no encontrado' });
      if (rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Acceso denegado' });
      if (rows[0].offer_status !== 'accepted') {
        return res.status(400).json({ error: 'La oferta no ha sido aceptada aún' });
      }

      // Comprobar si ya existe un pago completado
      const [existingPayment] = await db.query(
        'SELECT id, status FROM payments WHERE order_id = ?', [order_id]
      );
      if (existingPayment.length && existingPayment[0].status === 'completed') {
        return res.status(409).json({ error: 'El pedido ya está pagado' });
      }

      // ── Validación falsa de tarjeta ──────────────────────────────────────────
      const cleanCard = card_number.replace(/\s+/g, '');
      const isValid   = getValidCards().includes(cleanCard);
      const status    = isValid ? 'completed' : 'failed';
      const fakeRef   = `FAKE-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      // ─────────────────────────────────────────────────────────────────────────

      const conn = await db.getConnection();
      await conn.beginTransaction();
      try {
        let paymentId;

        if (!existingPayment.length) {
          const [result] = await conn.query(
            `INSERT INTO payments
               (order_id, customer_id, amount, currency, status, payment_method, stripe_payment_id, paid_at)
             VALUES (?,?,?,?,?,?,?,?)`,
            [
              order_id,
              rows[0].customer_id,
              rows[0].price,
              rows[0].currency || 'EUR',
              status,
              'card',
              fakeRef,
              isValid ? new Date() : null,
            ]
          );
          paymentId = result.insertId;
        } else {
          paymentId = existingPayment[0].id;
          await conn.query(
            'UPDATE payments SET status = ?, stripe_payment_id = ?, paid_at = ? WHERE id = ?',
            [status, fakeRef, isValid ? new Date() : null, paymentId]
          );
        }

        if (isValid) {
          await conn.query('UPDATE orders SET status = "processing" WHERE id = ?', [order_id]);
        }

        await conn.commit();
        conn.release();

        if (isValid) {
          return res.json({
            success: true,
            payment_id: paymentId,
            reference: fakeRef,
            message: 'Pago realizado correctamente. Tu pedido está en proceso.',
          });
        } else {
          return res.status(402).json({
            success: false,
            payment_id: paymentId,
            message: 'Tarjeta rechazada. Comprueba los datos e inténtalo de nuevo.',
          });
        }
      } catch (e) {
        await conn.rollback();
        conn.release();
        throw e;
      }
    } catch (err) { next(err); }
  }
);

// GET /api/payments  – Staff lista todos los pagos
router.get('/', authenticate, authorize('operator','manager','admin'), async (req, res, next) => {
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  let where = ['1=1'];
  const params = [];
  if (status) { where.push('p.status = ?'); params.push(status); }

  try {
    const [rows] = await db.query(
      `SELECT p.*, CONCAT(c.first_name,' ',c.last_name) AS customer_name, o.product_description
       FROM payments p
       JOIN customers c ON c.id = p.customer_id
       JOIN orders    o ON o.id = p.order_id
       WHERE ${where.join(' AND ')}
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM payments p WHERE ${where.join(' AND ')}`, params
    );
    res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// GET /api/payments/:id
router.get('/:id', authenticate, async (req, res, next) => {
  const isStaff = ['operator','manager','admin'].includes(req.user.role);
  try {
    const [rows] = await db.query(
      `SELECT p.*, c.user_id AS customer_user_id
       FROM payments p
       JOIN customers c ON c.id = p.customer_id
       WHERE p.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pago no encontrado' });
    if (!isStaff && rows[0].customer_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/payments/:id/refund  – Staff emite reembolso (simulado)
router.post('/:id/refund', authenticate, authorize('manager','admin'), async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM payments WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Pago no encontrado' });
    if (rows[0].status !== 'completed') {
      return res.status(400).json({ error: 'Solo se puede reembolsar un pago completado' });
    }
    await db.query('UPDATE payments SET status = "refunded" WHERE id = ?', [req.params.id]);
    res.json({ message: 'Reembolso emitido correctamente' });
  } catch (err) { next(err); }
});

module.exports = router;
