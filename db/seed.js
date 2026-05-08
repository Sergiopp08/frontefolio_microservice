// node db/seed.js  (desde frontefolio_api/)
// Inserta datos de prueba. Idempotente: no duplica si ya existen.
const path   = require('path');
const mysql  = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

function getConnection() {
  return mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    port:     process.env.DB_PORT     || 3306,
    database: process.env.DB_NAME     || 'frontefolio',
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
  });
}

async function seed() {
  const conn = await getConnection();

  const [rows] = await conn.execute('SELECT COUNT(*) AS count FROM users');
  if (rows[0].count > 0) {
    console.log('  La base de datos no está vacía. Saltando seed.');
    await conn.end();
    return;
  }

  // ── Categorías ───────────────────────────────────────────────
  await conn.execute(`
    INSERT IGNORE INTO categories (id, name, description) VALUES
      (1, 'Electrónica',           'Dispositivos electrónicos y tecnología'),
      (2, 'Textil y moda',         'Ropa, calzado y accesorios'),
      (3, 'Alimentación y bebidas','Productos alimenticios y bebidas importadas'),
      (4, 'Cosmética y belleza',   'Productos de cuidado personal y cosmética'),
      (5, 'Maquinaria industrial', 'Equipamiento industrial y herramientas')
  `);
  console.log('  ✓ Categorías');

  // ── Usuarios ─────────────────────────────────────────────────
  const hash = bcrypt.hashSync('Frontefolio123!', 10);
  const seedUsers = [
    { id: 1, email: 'admin@frontefolio.com',    role: 'admin'    },
    { id: 2, email: 'manager@frontefolio.com',  role: 'manager'  },
    { id: 3, email: 'operador@frontefolio.com', role: 'operator' },
    { id: 4, email: 'cliente@frontefolio.com',  role: 'customer' },
  ];
  for (const u of seedUsers) {
    await conn.execute(
      `INSERT IGNORE INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)`,
      [u.id, u.email, hash, u.role]
    );
  }
  console.log('  ✓ Usuarios  (contraseña: Frontefolio123!)');

  // ── Personal (staff) ─────────────────────────────────────────
  await conn.execute(`
    INSERT IGNORE INTO staff (id, user_id, first_name, last_name, department, position, hire_date) VALUES
      (1, 1, 'Ana',    'García',   'Dirección',           'CEO',               '2023-01-01'),
      (2, 2, 'Carlos', 'López',    'Operaciones',         'Operations Manager', '2023-03-15'),
      (3, 3, 'María',  'Martínez', 'Atención al cliente', 'Import Specialist',  '2023-06-01')
  `);
  console.log('  ✓ Staff');

  // ── Cliente ───────────────────────────────────────────────────
  await conn.execute(`
    INSERT IGNORE INTO customers (id, user_id, first_name, last_name, phone, city, postal_code, nif) VALUES
      (1, 4, 'Juan', 'Pérez', '+34 612 345 678', 'Madrid', '28001', '12345678A')
  `);
  console.log('  ✓ Clientes');

  // ── Proveedores ───────────────────────────────────────────────
  // China = id 26, Germany = id 2, Japan = id 25
  await conn.execute(`
    INSERT IGNORE INTO suppliers (id, name, country_id, contact_name, contact_email, contact_phone, website) VALUES
      (1, 'Shenzhen Tech Co., Ltd.', 26, 'Li Wei',     'liwei@sztech.cn',          '+86 755 8888 1234', 'https://sztech.cn'),
      (2, 'Munich Import GmbH',       2, 'Klaus Bauer', 'k.bauer@munich-import.de', '+49 89 4444 5678',  'https://munich-import.de'),
      (3, 'Osaka Trading Co.',        25, 'Yuki Tanaka', 'y.tanaka@osakatrading.jp', '+81 6 6666 7890',  'https://osakatrading.jp')
  `);
  console.log('  ✓ Proveedores');

  // ── Inventario ────────────────────────────────────────────────
  await conn.execute(`
    INSERT IGNORE INTO inventory (id, name, description, category_id, country_id, estimated_price, currency, stock, sku) VALUES
      (1, 'Smartphone Android Pro 12',
          'Smartphone 6.7" AMOLED, 256GB, cámara 108MP, batería 5000mAh',
          1, 26, 380.00, 'EUR', 25, 'SMRT-AND-001'),
      (2, 'Smartwatch Fitness Plus',
          'Reloj inteligente con monitorización de salud, GPS, 7 días batería',
          1, 26, 89.00, 'EUR', 40, 'SWTCH-FIT-001'),
      (3, 'Camiseta Lino Premium',
          'Camiseta 100% lino, corte regular, disponible en 5 colores',
          2, 30, 14.00, 'EUR', 100, 'CAM-LIN-001'),
      (4, 'Sake Junmai Daiginjo',
          'Sake premium japonés, 720ml, 15.5% vol, cosecha limitada',
          3, 25, 45.00, 'EUR', 15, 'SAKE-JDG-001'),
      (5, 'Sérum Vitamina C 20%',
          'Sérum antioxidante con vitamina C pura, ácido hialurónico y niacinamida, 30ml',
          4, 3, 22.00, 'EUR', 60, 'SRUM-VTC-001')
  `);
  console.log('  ✓ Inventario');

  // ── Pedidos de prueba ─────────────────────────────────────────
  // China = id 26, Vietnam = id 30
  await conn.execute(`
    INSERT IGNORE INTO orders
      (id, customer_id, product_description, country_id, assigned_staff_id, supplier_id, status, notes)
    VALUES
      (1, 1,
       'iPhone 15 Pro Max 256GB color titanio natural',
       26, 3, 1, 'offer_sent',
       'Cliente solicita garantía de 2 años y envío asegurado'),
      (2, 1,
       'Zapatillas deportivas Nike Air Max Talla 43, color negro/blanco',
       30, NULL, NULL, 'pending_review',
       NULL)
  `);
  console.log('  ✓ Pedidos');

  // ── Oferta para pedido 1 ──────────────────────────────────────
  const validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 19).replace('T', ' ');
  await conn.execute(`
    INSERT IGNORE INTO offers (id, order_id, price, currency, description, valid_until, status) VALUES
      (1, 1, 1150.00, 'EUR',
       'iPhone 15 Pro Max 256GB titanio. Incluye garantía oficial Apple 2 años, envío asegurado y despacho aduanero.',
       ?, 'pending')
  `, [validUntil]);
  console.log('  ✓ Ofertas');

  await conn.end();
}

console.log('Seed:');
seed().catch(err => {
  console.error('Error en seed:', err.message);
  process.exit(1);
});
