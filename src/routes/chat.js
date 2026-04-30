const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/connection');
const { authenticate, authorize } = require('../middleware/auth');

// ─── Conversaciones ────────────────────────────────────────────────────────────

// GET /api/chat/conversations  – Staff: todas; cliente: las suyas
router.get('/conversations', authenticate, async (req, res, next) => {
  const isStaff = ['operator','manager','admin'].includes(req.user.role);
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  let where = ['1=1'];
  const params = [];

  if (!isStaff) {
    const [cust] = await db.query('SELECT id FROM customers WHERE user_id = ?', [req.user.id]);
    if (!cust.length) return res.status(403).json({ error: 'No eres cliente' });
    where.push('conv.customer_id = ?');
    params.push(cust[0].id);
  }
  if (status) { where.push('conv.status = ?'); params.push(status); }

  try {
    const [rows] = await db.query(
      `SELECT conv.*,
              CONCAT(c.first_name,' ',c.last_name) AS customer_name,
              CONCAT(s.first_name,' ',s.last_name)  AS staff_name,
              (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = conv.id AND m.read_at IS NULL AND m.sender_type = 'customer') AS unread_count
       FROM chat_conversations conv
       JOIN customers c ON c.id = conv.customer_id
       LEFT JOIN staff s ON s.id = conv.staff_id
       WHERE ${where.join(' AND ')}
       ORDER BY conv.updated_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM chat_conversations conv WHERE ${where.join(' AND ')}`, params
    );
    res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// GET /api/chat/conversations/:id
router.get('/conversations/:id', authenticate, async (req, res, next) => {
  const isStaff = ['operator','manager','admin'].includes(req.user.role);
  try {
    const [rows] = await db.query(
      `SELECT conv.*, c.user_id AS customer_user_id,
              CONCAT(c.first_name,' ',c.last_name) AS customer_name,
              CONCAT(s.first_name,' ',s.last_name)  AS staff_name
       FROM chat_conversations conv
       JOIN customers c ON c.id = conv.customer_id
       LEFT JOIN staff s ON s.id = conv.staff_id
       WHERE conv.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Conversación no encontrada' });
    if (!isStaff && rows[0].customer_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/chat/conversations  – Cliente abre conversación
router.post('/conversations', authenticate, authorize('customer'),
  body('subject').optional().trim(),
  async (req, res, next) => {
    const { subject, order_id } = req.body;
    try {
      const [cust] = await db.query('SELECT id FROM customers WHERE user_id = ?', [req.user.id]);
      if (!cust.length) return res.status(400).json({ error: 'Perfil de cliente no encontrado' });

      const [result] = await db.query(
        'INSERT INTO chat_conversations (customer_id, order_id, subject) VALUES (?,?,?)',
        [cust[0].id, order_id || null, subject || null]
      );
      res.status(201).json({ id: result.insertId });
    } catch (err) { next(err); }
  }
);

// PATCH /api/chat/conversations/:id/assign  – Staff se asigna la conversación
router.patch('/conversations/:id/assign', authenticate, authorize('operator','manager','admin'),
  async (req, res, next) => {
    try {
      const [staffRow] = await db.query('SELECT id FROM staff WHERE user_id = ?', [req.user.id]);
      if (!staffRow.length) return res.status(400).json({ error: 'Perfil de staff no encontrado' });
      await db.query('UPDATE chat_conversations SET staff_id = ? WHERE id = ?', [staffRow[0].id, req.params.id]);
      res.json({ message: 'Conversación asignada' });
    } catch (err) { next(err); }
  }
);

// PATCH /api/chat/conversations/:id/close  – Cerrar conversación
router.patch('/conversations/:id/close', authenticate, async (req, res, next) => {
  const isStaff = ['operator','manager','admin'].includes(req.user.role);
  try {
    const [rows] = await db.query(
      'SELECT customer_id FROM chat_conversations WHERE id = ?', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Conversación no encontrada' });

    if (!isStaff) {
      const [cust] = await db.query('SELECT id FROM customers WHERE user_id = ?', [req.user.id]);
      if (!cust.length || cust[0].id !== rows[0].customer_id) {
        return res.status(403).json({ error: 'Acceso denegado' });
      }
    }
    await db.query('UPDATE chat_conversations SET status = "closed" WHERE id = ?', [req.params.id]);
    res.json({ message: 'Conversación cerrada' });
  } catch (err) { next(err); }
});

// ─── Mensajes ──────────────────────────────────────────────────────────────────

// GET /api/chat/conversations/:id/messages
router.get('/conversations/:id/messages', authenticate, async (req, res, next) => {
  const isStaff = ['operator','manager','admin'].includes(req.user.role);
  const { page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const [conv] = await db.query(
      'SELECT customer_id FROM chat_conversations WHERE id = ?', [req.params.id]
    );
    if (!conv.length) return res.status(404).json({ error: 'Conversación no encontrada' });

    if (!isStaff) {
      const [cust] = await db.query('SELECT id FROM customers WHERE user_id = ?', [req.user.id]);
      if (!cust.length || cust[0].id !== conv[0].customer_id) {
        return res.status(403).json({ error: 'Acceso denegado' });
      }
      // Marcar como leídos los mensajes del staff al cliente
      await db.query(
        'UPDATE chat_messages SET read_at = NOW() WHERE conversation_id = ? AND sender_type = "staff" AND read_at IS NULL',
        [req.params.id]
      );
    } else {
      // Marcar como leídos los mensajes del cliente al staff
      await db.query(
        'UPDATE chat_messages SET read_at = NOW() WHERE conversation_id = ? AND sender_type = "customer" AND read_at IS NULL',
        [req.params.id]
      );
    }

    const [rows] = await db.query(
      `SELECT m.*
       FROM chat_messages m
       WHERE m.conversation_id = ?
       ORDER BY m.created_at ASC
       LIMIT ? OFFSET ?`,
      [req.params.id, parseInt(limit), parseInt(offset)]
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// POST /api/chat/conversations/:id/messages  – Enviar mensaje
router.post('/conversations/:id/messages', authenticate,
  body('content').notEmpty().trim(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const isStaff = ['operator','manager','admin'].includes(req.user.role);
    try {
      const [conv] = await db.query(
        'SELECT customer_id, status FROM chat_conversations WHERE id = ?', [req.params.id]
      );
      if (!conv.length) return res.status(404).json({ error: 'Conversación no encontrada' });
      if (conv[0].status === 'closed') return res.status(400).json({ error: 'La conversación está cerrada' });

      let sender_id;
      let sender_type;

      if (isStaff) {
        const [staffRow] = await db.query('SELECT id FROM staff WHERE user_id = ?', [req.user.id]);
        if (!staffRow.length) return res.status(400).json({ error: 'Perfil de staff no encontrado' });
        sender_id   = staffRow[0].id;
        sender_type = 'staff';
      } else {
        const [cust] = await db.query('SELECT id FROM customers WHERE user_id = ?', [req.user.id]);
        if (!cust.length || cust[0].id !== conv[0].customer_id) {
          return res.status(403).json({ error: 'Acceso denegado' });
        }
        sender_id   = cust[0].id;
        sender_type = 'customer';
      }

      const [result] = await db.query(
        'INSERT INTO chat_messages (conversation_id, sender_id, sender_type, content) VALUES (?,?,?,?)',
        [req.params.id, sender_id, sender_type, req.body.content]
      );
      await db.query('UPDATE chat_conversations SET updated_at = NOW() WHERE id = ?', [req.params.id]);

      res.status(201).json({ id: result.insertId });
    } catch (err) { next(err); }
  }
);

module.exports = router;
