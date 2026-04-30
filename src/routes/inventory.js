const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db/connection');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/inventory  – Listado con filtros
router.get('/', async (req, res, next) => {
  const { category_id, country_id, search, active, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  let where = ['1=1'];
  const params = [];

  if (category_id) { where.push('i.category_id = ?'); params.push(category_id); }
  if (country_id)  { where.push('i.country_id = ?');  params.push(country_id); }
  if (active !== undefined) { where.push('i.active = ?'); params.push(active === 'true' ? 1 : 0); }
  if (search) { where.push('(i.name LIKE ? OR i.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

  try {
    const [rows] = await db.query(
      `SELECT i.*, c.name AS category_name, co.name AS country_name, co.code AS country_code
       FROM inventory i
       LEFT JOIN categories c  ON c.id = i.category_id
       LEFT JOIN countries  co ON co.id = i.country_id
       WHERE ${where.join(' AND ')}
       ORDER BY i.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM inventory i WHERE ${where.join(' AND ')}`,
      params
    );
    res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// GET /api/inventory/categories
router.get('/categories', async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM categories WHERE active = 1 ORDER BY name');
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/inventory/:id
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT i.*, c.name AS category_name, co.name AS country_name, co.code AS country_code
       FROM inventory i
       LEFT JOIN categories c  ON c.id = i.category_id
       LEFT JOIN countries  co ON co.id = i.country_id
       WHERE i.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/inventory  – Crear producto (staff)
router.post('/', authenticate, authorize('operator','manager','admin'),
  body('name').notEmpty().trim(),
  body('estimated_price').optional().isFloat({ min: 0 }),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, description, category_id, country_id, estimated_price, currency, stock, sku, image_url } = req.body;
    try {
      const [result] = await db.query(
        'INSERT INTO inventory (name, description, category_id, country_id, estimated_price, currency, stock, sku, image_url) VALUES (?,?,?,?,?,?,?,?,?)',
        [name, description || null, category_id || null, country_id || null, estimated_price || null, currency || 'EUR', stock || 0, sku || null, image_url || null]
      );
      res.status(201).json({ id: result.insertId });
    } catch (err) { next(err); }
  }
);

// PUT /api/inventory/:id
router.put('/:id', authenticate, authorize('operator','manager','admin'),
  async (req, res, next) => {
    const allowed = ['name','description','category_id','country_id','estimated_price','currency','stock','sku','image_url','active'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!fields.length) return res.status(400).json({ error: 'Sin campos para actualizar' });

    const set    = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => req.body[f]);
    try {
      await db.query(`UPDATE inventory SET ${set} WHERE id = ?`, [...values, req.params.id]);
      res.json({ message: 'Producto actualizado' });
    } catch (err) { next(err); }
  }
);

// PATCH /api/inventory/:id/stock  – Ajuste rápido de stock
router.patch('/:id/stock', authenticate, authorize('operator','manager','admin'),
  body('stock').isInt({ min: 0 }),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      await db.query('UPDATE inventory SET stock = ? WHERE id = ?', [req.body.stock, req.params.id]);
      res.json({ message: 'Stock actualizado' });
    } catch (err) { next(err); }
  }
);

// DELETE /api/inventory/:id  – Soft delete
router.delete('/:id', authenticate, authorize('manager','admin'), async (req, res, next) => {
  try {
    await db.query('UPDATE inventory SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Producto desactivado' });
  } catch (err) { next(err); }
});

module.exports = router;
