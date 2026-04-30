const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db      = require('../db/connection');
const { authenticate } = require('../middleware/auth');

// POST /api/auth/register  – Registro de cliente
router.post('/register',
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('first_name').notEmpty().trim(),
  body('last_name').notEmpty().trim(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password, first_name, last_name, phone, address, city, postal_code, nif } = req.body;
    try {
      const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
      if (existing.length) return res.status(409).json({ error: 'Email ya registrado' });

      const hash = await bcrypt.hash(password, 10);
      const conn = await db.getConnection();
      await conn.beginTransaction();
      try {
        const [userResult] = await conn.query(
          'INSERT INTO users (email, password_hash, role) VALUES (?, ?, "customer")',
          [email, hash]
        );
        const userId = userResult.insertId;
        await conn.query(
          'INSERT INTO customers (user_id, first_name, last_name, phone, address, city, postal_code, nif) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [userId, first_name, last_name, phone || null, address || null, city || null, postal_code || null, nif || null]
        );
        await conn.commit();
        conn.release();

        const token = jwt.sign({ id: userId, role: 'customer' }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
        res.status(201).json({ token });
      } catch (e) {
        await conn.rollback();
        conn.release();
        throw e;
      }
    } catch (err) { next(err); }
  }
);

// POST /api/auth/login
router.post('/login',
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    try {
      const [rows] = await db.query('SELECT * FROM users WHERE email = ? AND active = 1', [email]);
      if (!rows.length) return res.status(401).json({ error: 'Credenciales incorrectas' });

      const user = rows[0];
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' });

      const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
      res.json({ token, role: user.role });
    } catch (err) { next(err); }
  }
);

// GET /api/auth/me – Perfil propio
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT u.id, u.email, u.role, u.created_at,
              c.first_name, c.last_name, c.phone, c.address, c.city, c.postal_code, c.nif
       FROM users u
       LEFT JOIN customers c ON c.user_id = u.id
       WHERE u.id = ?`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/auth/change-password
router.put('/change-password', authenticate,
  body('current_password').notEmpty(),
  body('new_password').isLength({ min: 6 }),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { current_password, new_password } = req.body;
    try {
      const [rows] = await db.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
      const valid = await bcrypt.compare(current_password, rows[0].password_hash);
      if (!valid) return res.status(400).json({ error: 'Contraseña actual incorrecta' });

      const hash = await bcrypt.hash(new_password, 10);
      await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
      res.json({ message: 'Contraseña actualizada' });
    } catch (err) { next(err); }
  }
);

module.exports = router;
