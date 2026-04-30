const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db      = require('../db/connection');
const { authenticate, authorize } = require('../middleware/auth');

// Todos los endpoints requieren ser staff
router.use(authenticate, authorize('manager','admin'));

// GET /api/staff
router.get('/', async (req, res, next) => {
  const { search, role, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  let where = ['1=1'];
  const params = [];

  if (search) {
    where.push('(s.first_name LIKE ? OR s.last_name LIKE ? OR u.email LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (role) { where.push('u.role = ?'); params.push(role); }

  try {
    const [rows] = await db.query(
      `SELECT s.*, u.email, u.role, u.active
       FROM staff s
       JOIN users u ON u.id = s.user_id
       WHERE ${where.join(' AND ')}
       ORDER BY s.first_name
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM staff s JOIN users u ON u.id = s.user_id WHERE ${where.join(' AND ')}`,
      params
    );
    res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// GET /api/staff/:id
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT s.*, u.email, u.role, u.active, u.created_at AS registered_at
       FROM staff s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Empleado no encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/staff  – Crear empleado
router.post('/',
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('first_name').notEmpty().trim(),
  body('last_name').notEmpty().trim(),
  body('role').isIn(['operator','manager','admin']),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password, first_name, last_name, role, phone, department, position, hire_date } = req.body;
    try {
      const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
      if (existing.length) return res.status(409).json({ error: 'Email ya en uso' });

      const hash = await bcrypt.hash(password, 10);
      const conn = await db.getConnection();
      await conn.beginTransaction();
      try {
        const [userResult] = await conn.query(
          'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
          [email, hash, role]
        );
        const userId = userResult.insertId;
        const [staffResult] = await conn.query(
          'INSERT INTO staff (user_id, first_name, last_name, phone, department, position, hire_date) VALUES (?,?,?,?,?,?,?)',
          [userId, first_name, last_name, phone || null, department || null, position || null, hire_date || null]
        );
        await conn.commit();
        conn.release();
        res.status(201).json({ id: staffResult.insertId });
      } catch (e) {
        await conn.rollback();
        conn.release();
        throw e;
      }
    } catch (err) { next(err); }
  }
);

// PUT /api/staff/:id
router.put('/:id', async (req, res, next) => {
  const allowed = ['first_name','last_name','phone','department','position','hire_date'];
  const fields  = Object.keys(req.body).filter(k => allowed.includes(k));
  if (!fields.length) return res.status(400).json({ error: 'Sin campos para actualizar' });

  const set    = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => req.body[f]);
  try {
    await db.query(`UPDATE staff SET ${set} WHERE id = ?`, [...values, req.params.id]);
    res.json({ message: 'Empleado actualizado' });
  } catch (err) { next(err); }
});

// PATCH /api/staff/:id/role  – Cambiar rol
router.patch('/:id/role',
  body('role').isIn(['operator','manager','admin']),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const [rows] = await db.query('SELECT user_id FROM staff WHERE id = ?', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Empleado no encontrado' });
      await db.query('UPDATE users SET role = ? WHERE id = ?', [req.body.role, rows[0].user_id]);
      res.json({ message: 'Rol actualizado' });
    } catch (err) { next(err); }
  }
);

// PATCH /api/staff/:id/active
router.patch('/:id/active',
  body('active').isBoolean(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const [rows] = await db.query('SELECT user_id FROM staff WHERE id = ?', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Empleado no encontrado' });
      await db.query('UPDATE users SET active = ? WHERE id = ?', [req.body.active ? 1 : 0, rows[0].user_id]);
      res.json({ message: 'Estado actualizado' });
    } catch (err) { next(err); }
  }
);

// DELETE /api/staff/:id  – Eliminar empleado
router.delete('/:id', authorize('admin'), async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT user_id FROM staff WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Empleado no encontrado' });
    await db.query('UPDATE users SET active = 0 WHERE id = ?', [rows[0].user_id]);
    res.json({ message: 'Empleado desactivado' });
  } catch (err) { next(err); }
});

module.exports = router;
