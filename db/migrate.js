// node db/migrate.js  (desde frontefolio_api/)
const fs   = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function migrate() {
  const host     = process.env.DB_HOST     || 'localhost';
  const port     = process.env.DB_PORT     || 3306;
  const user     = process.env.DB_USER     || 'root';
  const password = process.env.DB_PASSWORD || '';
  const dbName   = process.env.DB_NAME     || 'frontefolio';

  // Paso 1: conectar sin base de datos y crearla si no existe
  const base = await mysql.createConnection({ host, port, user, password });
  await base.execute(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await base.end();
  console.log(`  Base de datos '${dbName}' verificada.`);

  // Paso 2: conectar a la base de datos y aplicar migraciones
  const conn = await mysql.createConnection({
    host, port, user, password,
    database:           dbName,
    multipleStatements: true,
  });

  const [tables] = await conn.execute(
    'SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = ?',
    [dbName]
  );
  if (tables[0].count > 0) {
    console.log('  La base de datos no está vacía. Saltando migraciones.');
    await conn.end();
    return;
  }

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      filename   VARCHAR(255) NOT NULL UNIQUE,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const [applied] = await conn.execute('SELECT filename FROM schema_migrations');
  const appliedSet = new Set(applied.map(r => r.filename));

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (appliedSet.has(file)) continue;
    console.log(`  → Aplicando ${file}...`);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await conn.query(sql);
    await conn.execute('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
    ran++;
  }

  if (ran === 0) console.log('  Sin migraciones pendientes.');
  else console.log(`  ${ran} migración(es) aplicada(s).`);

  await conn.end();
}

console.log('Migraciones:');
migrate().catch(err => {
  console.error('Error en migración:', err.message);
  process.exit(1);
});
