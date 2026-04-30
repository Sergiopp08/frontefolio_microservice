const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/connection');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('operator','manager','admin'));

// GET /api/suppliers
router.get('/', async (req, res, next) => {
  const { country_id, search, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  let where = ['1=1'];
  const params = [];

  if (country_id) { where.push('s.country_id = ?'); params.push(country_id); }
  if (search) {
    where.push('(s.name LIKE ? OR s.contact_name LIKE ? OR s.contact_email LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  try {
    const [rows] = await db.query(
      `SELECT s.*, c.name AS country_name, c.code AS country_code
       FROM suppliers s
       LEFT JOIN countries c ON c.id = s.country_id
       WHERE ${where.join(' AND ')} AND s.active = 1
       ORDER BY s.name
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM suppliers s WHERE ${where.join(' AND ')} AND s.active = 1`, params
    );
    res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// GET /api/suppliers/:id
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT s.*, c.name AS country_name, c.code AS country_code
       FROM suppliers s
       LEFT JOIN countries c ON c.id = s.country_id
       WHERE s.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/suppliers
router.post('/',
  body('name').notEmpty().trim(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, country_id, contact_name, contact_email, contact_phone, address, website, notes } = req.body;
    try {
      const [result] = await db.query(
        'INSERT INTO suppliers (name, country_id, contact_name, contact_email, contact_phone, address, website, notes) VALUES (?,?,?,?,?,?,?,?)',
        [name, country_id || null, contact_name || null, contact_email || null, contact_phone || null, address || null, website || null, notes || null]
      );
      res.status(201).json({ id: result.insertId });
    } catch (err) { next(err); }
  }
);

// PUT /api/suppliers/:id
router.put('/:id', async (req, res, next) => {
  const allowed = ['name','country_id','contact_name','contact_email','contact_phone','address','website','notes'];
  const fields  = Object.keys(req.body).filter(k => allowed.includes(k));
  if (!fields.length) return res.status(400).json({ error: 'Sin campos para actualizar' });

  const set    = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => req.body[f]);
  try {
    await db.query(`UPDATE suppliers SET ${set} WHERE id = ?`, [...values, req.params.id]);
    res.json({ message: 'Proveedor actualizado' });
  } catch (err) { next(err); }
});

// DELETE /api/suppliers/:id  – Soft delete
router.delete('/:id', authorize('manager','admin'), async (req, res, next) => {
  try {
    await db.query('UPDATE suppliers SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Proveedor desactivado' });
  } catch (err) { next(err); }
});

module.exports = router;
