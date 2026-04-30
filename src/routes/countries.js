const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/connection');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/countries  – Público
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM countries WHERE active = 1 ORDER BY name');
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/countries  – Staff añade país
router.post('/', authenticate, authorize('manager','admin'),
  body('name').notEmpty().trim(),
  body('code').isLength({ min: 2, max: 2 }).toUpperCase(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const [result] = await db.query(
        'INSERT INTO countries (name, code) VALUES (?,?)',
        [req.body.name, req.body.code]
      );
      res.status(201).json({ id: result.insertId });
    } catch (err) { next(err); }
  }
);

// PATCH /api/countries/:id/active
router.patch('/:id/active', authenticate, authorize('manager','admin'),
  body('active').isBoolean(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      await db.query('UPDATE countries SET active = ? WHERE id = ?', [req.body.active ? 1 : 0, req.params.id]);
      res.json({ message: 'País actualizado' });
    } catch (err) { next(err); }
  }
);

module.exports = router;
