-- ============================================================
--  FRONTEFOLIO - Schema SQL
-- ============================================================

CREATE DATABASE IF NOT EXISTS frontefolio CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE frontefolio;

-- ------------------------------------------------------------
-- USERS (base para clientes y personal)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('customer','operator','manager','admin') NOT NULL DEFAULT 'customer',
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- CUSTOMERS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL UNIQUE,
  first_name  VARCHAR(100) NOT NULL,
  last_name   VARCHAR(100) NOT NULL,
  phone       VARCHAR(30),
  address     VARCHAR(255),
  city        VARCHAR(100),
  postal_code VARCHAR(20),
  nif         VARCHAR(20),
  notes       TEXT,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- STAFF (personal interno)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL UNIQUE,
  first_name VARCHAR(100) NOT NULL,
  last_name  VARCHAR(100) NOT NULL,
  phone      VARCHAR(30),
  department VARCHAR(100),
  position   VARCHAR(100),
  hire_date  DATE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- COUNTRIES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS countries (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  code       CHAR(2) NOT NULL UNIQUE,
  active     BOOLEAN NOT NULL DEFAULT TRUE
);

-- ------------------------------------------------------------
-- CATEGORIES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE
);

-- ------------------------------------------------------------
-- INVENTORY (catálogo de productos)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  category_id     INT,
  country_id      INT,
  estimated_price DECIMAL(10,2),
  currency        CHAR(3) NOT NULL DEFAULT 'EUR',
  stock           INT NOT NULL DEFAULT 0,
  sku             VARCHAR(100) UNIQUE,
  image_url       VARCHAR(500),
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (country_id)  REFERENCES countries(id)
);

-- ------------------------------------------------------------
-- SUPPLIERS (proveedores en país de origen)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  country_id    INT,
  contact_name  VARCHAR(150),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  address       TEXT,
  website       VARCHAR(255),
  notes         TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (country_id) REFERENCES countries(id)
);

-- ------------------------------------------------------------
-- ORDERS (solicitudes de producto del cliente)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  customer_id         INT NOT NULL,
  product_id          INT,
  product_description TEXT NOT NULL,
  country_id          INT,
  supplier_id         INT,
  assigned_staff_id   INT,
  status              ENUM(
    'pending_review',
    'searching_supplier',
    'offer_sent',
    'offer_accepted',
    'offer_rejected',
    'processing',
    'shipped',
    'in_customs',
    'delivered',
    'cancelled'
  ) NOT NULL DEFAULT 'pending_review',
  notes               TEXT,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id)       REFERENCES customers(id),
  FOREIGN KEY (product_id)        REFERENCES inventory(id),
  FOREIGN KEY (country_id)        REFERENCES countries(id),
  FOREIGN KEY (supplier_id)       REFERENCES suppliers(id),
  FOREIGN KEY (assigned_staff_id) REFERENCES staff(id)
);

-- ------------------------------------------------------------
-- OFFERS (oferta que el operador envía al cliente)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS offers (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  order_id    INT NOT NULL UNIQUE,
  price       DECIMAL(10,2) NOT NULL,
  currency    CHAR(3) NOT NULL DEFAULT 'EUR',
  description TEXT,
  valid_until DATETIME,
  status      ENUM('pending','accepted','rejected','expired') NOT NULL DEFAULT 'pending',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- PAYMENTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  order_id           INT NOT NULL,
  customer_id        INT NOT NULL,
  amount             DECIMAL(10,2) NOT NULL,
  currency           CHAR(3) NOT NULL DEFAULT 'EUR',
  status             ENUM('pending','completed','failed','refunded') NOT NULL DEFAULT 'pending',
  payment_method     VARCHAR(50),
  stripe_payment_id  VARCHAR(255),
  stripe_session_id  VARCHAR(255),
  paid_at            DATETIME,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id)    REFERENCES orders(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- ------------------------------------------------------------
-- SHIPMENTS (seguimiento de envío)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipments (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  order_id           INT NOT NULL UNIQUE,
  tracking_number    VARCHAR(100),
  carrier            VARCHAR(100),
  origin_country_id  INT,
  status             ENUM(
    'preparing',
    'picked_up',
    'in_transit',
    'in_customs',
    'out_for_delivery',
    'delivered',
    'returned'
  ) NOT NULL DEFAULT 'preparing',
  estimated_delivery DATE,
  actual_delivery    DATETIME,
  tracking_url       VARCHAR(500),
  notes              TEXT,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id)          REFERENCES orders(id),
  FOREIGN KEY (origin_country_id) REFERENCES countries(id)
);

-- ------------------------------------------------------------
-- CHAT CONVERSATIONS (soporte)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_conversations (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  staff_id    INT,
  order_id    INT,
  subject     VARCHAR(255),
  status      ENUM('open','closed') NOT NULL DEFAULT 'open',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (staff_id)    REFERENCES staff(id),
  FOREIGN KEY (order_id)    REFERENCES orders(id)
);

-- ------------------------------------------------------------
-- CHAT MESSAGES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_messages (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  sender_id       INT NOT NULL,
  sender_type     ENUM('customer','staff') NOT NULL,
  content         TEXT NOT NULL,
  read_at         DATETIME,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- Países iniciales
-- ------------------------------------------------------------
INSERT IGNORE INTO countries (name, code) VALUES
  ('España','ES'),('Alemania','DE'),('Francia','FR'),('Italia','IT'),
  ('Portugal','PT'),('Países Bajos','NL'),('Bélgica','BE'),('Suiza','CH'),
  ('Austria','AT'),('Polonia','PL'),('Suecia','SE'),('Noruega','NO'),
  ('Dinamarca','DK'),('Finlandia','FI'),('Grecia','GR'),('Reino Unido','GB'),
  ('Estados Unidos','US'),('Canadá','CA'),('México','MX'),('Brasil','BR'),
  ('Argentina','AR'),('Colombia','CO'),('Chile','CL'),('Perú','PE'),
  ('Japón','JP'),('China','CN'),('Corea del Sur','KR'),('India','IN'),
  ('Tailandia','TH'),('Vietnam','VN'),('Indonesia','ID'),('Malasia','MY'),
  ('Singapur','SG'),('Filipinas','PH'),('Australia','AU'),('Nueva Zelanda','NZ'),
  ('Sudáfrica','ZA'),('Nigeria','NG'),('Kenia','KE'),('Marruecos','MA'),
  ('Egipto','EG'),('Turquía','TR'),('Emiratos Árabes','AE'),('Arabia Saudí','SA'),
  ('Israel','IL'),('Rusia','RU'),('Ucrania','UA'),('Rumanía','RO'),
  ('Hungría','HU'),('República Checa','CZ'),('Eslovaquia','SK'),('Croacia','HR');
