# Frontefolio API — Arquitectura de Microservicios

API REST para la plataforma Frontefolio — importación de productos de más de 50 países a España. Puerba 2

## Arquitectura

```
Cliente / Frontends
       │
       ▼
┌─────────────────┐   puerto 3000
│   api-gateway   │  ← único punto de entrada público
│  JWT verify     │  ← inyecta X-User-Id / X-User-Role
└────────┬────────┘
         │ HTTP interno
    ┌────┼────────────────────────────────┐
    ▼    ▼         ▼        ▼            ▼
 auth  user    catalog   order       payment
 3001  3002     3003      3004         3005
                        (orders
                        +offers)
                                   logistics  chat
                                     3006     3007
```

## Servicios

| Servicio            | Puerto | Responsabilidad                              |
|---------------------|--------|----------------------------------------------|
| `api-gateway`       | 3000   | Enrutamiento, verificación JWT, CORS         |
| `auth-service`      | 3001   | Registro, login, cambio de contraseña        |
| `user-service`      | 3002   | Clientes (`/api/customers`) y staff          |
| `catalog-service`   | 3003   | Inventario, países, proveedores              |
| `order-service`     | 3004   | Pedidos y ofertas                            |
| `payment-service`   | 3005   | Pagos simulados                              |
| `logistics-service` | 3006   | Envíos y tracking                            |
| `chat-service`      | 3007   | Chat de soporte cliente ↔ staff              |

## Flujo de autenticación

1. El cliente envía `Authorization: Bearer <jwt>` al gateway (puerto 3000).
2. El gateway verifica el token con `JWT_SECRET`.
   - Si es válido: inyecta `X-User-Id` y `X-User-Role` en los headers y reenvía la petición al servicio correspondiente.
   - Si es inválido: devuelve `401` sin llegar al servicio.
   - Si no hay token: reenvía sin headers de usuario (rutas públicas funcionan normalmente).


Todos los servicios comparten una única base de datos MySQL (`frontefolio`). Esta es la decisión pragmática para una PoC; en producción cada servicio tendría su propia BD.

## Estructura del proyecto

```
frontefolio_api/
├── services/
│   ├── api-gateway/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── server.js
│   │   └── src/
│   │       ├── app.js
│   │       └── middleware/auth.js        ← verifica JWT, inyecta headers
│   │
│   ├── auth-service/
│   ├── user-service/
│   ├── catalog-service/
│   ├── order-service/
│   ├── payment-service/
│   ├── logistics-service/
│   └── chat-service/
│       └── src/
│           ├── app.js
│           ├── db/connection.js
│           ├── middleware/
│           │   ├── auth.js               ← lee X-User-Id / X-User-Role
│           │   └── errorHandler.js
│           └── routes/
│
├── db/
│   ├── schema.sql                        ← schema completo + 52 países
│   └── init.js                           ← node db/init.js
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Requisitos previos

- [Node.js](https://nodejs.org/) v18+
- [MySQL](https://www.mysql.com/) v8+ **o** [Docker](https://www.docker.com/) + Docker Compose

---

## Opción A — Docker Compose (recomendado)

```bash
# 1. Crear el archivo de entorno
cp .env.example .env
# Editar .env con tu JWT_SECRET y DB_PASSWORD

# 2. Levantar todo (MySQL + 7 servicios + gateway)
docker compose up --build

# La API queda disponible en http://localhost:3000
```

Para parar:
```bash
docker compose down
```

---

## Opción B — Desarrollo local (sin Docker)

### 1. Inicializar la base de datos

```bash
# Instalar mysql2 en la raíz para poder ejecutar el script
npm install mysql2 dotenv

# Crear y poblar la BD
node db/init.js
```

### 2. Instalar dependencias de cada servicio

```bash
cd services/api-gateway    && npm install && cd ../..
cd services/auth-service   && npm install && cd ../..
cd services/user-service   && npm install && cd ../..
cd services/catalog-service && npm install && cd ../..
cd services/order-service  && npm install && cd ../..
cd services/payment-service && npm install && cd ../..
cd services/logistics-service && npm install && cd ../..
cd services/chat-service   && npm install && cd ../..
```

### 3. Configurar el entorno

Cada servicio lee el `.env` de la raíz de `frontefolio_api/`. Crea un único archivo:

```bash
cp .env.example .env
```

Edita `.env`:

```env
JWT_SECRET=cambia_esto_por_algo_seguro
DB_HOST=localhost
DB_PASSWORD=tu_contraseña
VALID_CARDS=4111111111111111,5500005555555554,4000000000000002
```

### 4. Arrancar los servicios

Abre 8 terminales (o usa un gestor como [pm2](https://pm2.keymetrics.io/)):

```bash
# Terminal 1
cd services/api-gateway    && npm run dev

# Terminal 2
cd services/auth-service   && npm run dev

# Terminal 3
cd services/user-service   && npm run dev

# Terminal 4
cd services/catalog-service && npm run dev

# Terminal 5
cd services/order-service  && npm run dev

# Terminal 6
cd services/payment-service && npm run dev

# Terminal 7
cd services/logistics-service && npm run dev

# Terminal 8
cd services/chat-service   && npm run dev
```

La API queda disponible en `http://localhost:3000`.

---

## Variables de entorno

| Variable                | Descripción                                        | Requerida |
|-------------------------|----------------------------------------------------|-----------|
| `JWT_SECRET`            | Clave para firmar/verificar tokens JWT             | Sí        |
| `JWT_EXPIRES_IN`        | Duración del token (ej. `7d`)                      | No        |
| `DB_HOST`               | Host de MySQL                                      | Sí        |
| `DB_PORT`               | Puerto MySQL (default `3306`)                      | No        |
| `DB_NAME`               | Nombre de la BD (default `frontefolio`)            | No        |
| `DB_USER`               | Usuario MySQL                                      | Sí        |
| `DB_PASSWORD`           | Contraseña MySQL                                   | Sí        |
| `VALID_CARDS`           | Tarjetas de prueba válidas (separadas por comas)   | No        |
| `FRONTEND_CUSTOMER_URL` | URL del frontend de cliente (CORS)                 | No        |
| `FRONTEND_ADMIN_URL`    | URL del frontend de admin (CORS)                   | No        |
| `AUTH_SERVICE_URL`      | URL interna del auth-service                       | No        |
| `USER_SERVICE_URL`      | URL interna del user-service                       | No        |
| `CATALOG_SERVICE_URL`   | URL interna del catalog-service                    | No        |
| `ORDER_SERVICE_URL`     | URL interna del order-service                      | No        |
| `PAYMENT_SERVICE_URL`   | URL interna del payment-service                    | No        |
| `LOGISTICS_SERVICE_URL` | URL interna del logistics-service                  | No        |
| `CHAT_SERVICE_URL`      | URL interna del chat-service                       | No        |

---

## Endpoints disponibles

Todos los endpoints se acceden a través del gateway en `http://localhost:3000`.

### Autenticación (`/api/auth`)

| Método | Ruta                       | Acceso  | Descripción                  |
|--------|----------------------------|---------|------------------------------|
| POST   | `/api/auth/register`       | Público | Registro de cliente          |
| POST   | `/api/auth/login`          | Público | Login → devuelve JWT         |
| GET    | `/api/auth/me`             | Auth    | Perfil propio                |
| PUT    | `/api/auth/change-password`| Auth    | Cambio de contraseña         |

### Catálogo (`/api/inventory`, `/api/countries`, `/api/suppliers`)

| Método | Ruta                          | Acceso           |
|--------|-------------------------------|------------------|
| GET    | `/api/inventory`              | Público          |
| GET    | `/api/inventory/categories`   | Público          |
| GET    | `/api/inventory/:id`          | Público          |
| POST   | `/api/inventory`              | operator+        |
| PUT    | `/api/inventory/:id`          | operator+        |
| PATCH  | `/api/inventory/:id/stock`    | operator+        |
| DELETE | `/api/inventory/:id`          | manager+         |
| GET    | `/api/countries`              | Público          |
| POST   | `/api/countries`              | manager+         |
| PATCH  | `/api/countries/:id/active`   | manager+         |
| GET    | `/api/suppliers`              | operator+        |
| POST   | `/api/suppliers`              | operator+        |
| PUT    | `/api/suppliers/:id`          | operator+        |
| DELETE | `/api/suppliers/:id`          | manager+         |

### Usuarios (`/api/customers`, `/api/staff`)

| Método | Ruta                           | Acceso                    |
|--------|--------------------------------|---------------------------|
| GET    | `/api/customers`               | operator+                 |
| GET    | `/api/customers/:id`           | propio o operator+        |
| PUT    | `/api/customers/:id`           | propio o operator+        |
| PATCH  | `/api/customers/:id/active`    | manager+                  |
| GET    | `/api/customers/:id/orders`    | propio o operator+        |
| GET    | `/api/customers/:id/payments`  | propio o operator+        |
| GET    | `/api/staff`                   | manager+                  |
| POST   | `/api/staff`                   | manager+                  |
| PUT    | `/api/staff/:id`               | manager+                  |
| PATCH  | `/api/staff/:id/role`          | manager+                  |
| PATCH  | `/api/staff/:id/active`        | manager+                  |
| DELETE | `/api/staff/:id`               | admin                     |

### Pedidos y ofertas (`/api/orders`, `/api/offers`)

| Método | Ruta                       | Acceso           |
|--------|----------------------------|------------------|
| GET    | `/api/orders`              | Auth             |
| GET    | `/api/orders/:id`          | Auth             |
| POST   | `/api/orders`              | customer         |
| PUT    | `/api/orders/:id/status`   | operator+        |
| PUT    | `/api/orders/:id/assign`   | manager+         |
| PUT    | `/api/orders/:id/supplier` | operator+        |
| DELETE | `/api/orders/:id`          | Auth             |
| GET    | `/api/offers`              | Auth             |
| GET    | `/api/offers/:id`          | Auth             |
| POST   | `/api/offers`              | operator+        |
| PUT    | `/api/offers/:id`          | operator+        |
| POST   | `/api/offers/:id/accept`   | customer         |
| POST   | `/api/offers/:id/reject`   | customer         |

### Pagos (`/api/payments`)

| Método | Ruta                       | Acceso    |
|--------|----------------------------|-----------|
| POST   | `/api/payments/pay`        | customer  |
| GET    | `/api/payments`            | operator+ |
| GET    | `/api/payments/:id`        | Auth      |
| POST   | `/api/payments/:id/refund` | manager+  |

### Envíos (`/api/shipments`)

| Método | Ruta                            | Acceso    |
|--------|---------------------------------|-----------|
| GET    | `/api/shipments`                | Auth      |
| GET    | `/api/shipments/:id`            | Auth      |
| GET    | `/api/shipments/order/:order_id`| Auth      |
| POST   | `/api/shipments`                | operator+ |
| PUT    | `/api/shipments/:id/status`     | operator+ |

### Chat (`/api/chat`)

| Método | Ruta                                      | Acceso    |
|--------|-------------------------------------------|-----------|
| GET    | `/api/chat/conversations`                 | Auth      |
| GET    | `/api/chat/conversations/:id`             | Auth      |
| POST   | `/api/chat/conversations`                 | customer  |
| PATCH  | `/api/chat/conversations/:id/assign`      | operator+ |
| PATCH  | `/api/chat/conversations/:id/close`       | Auth      |
| GET    | `/api/chat/conversations/:id/messages`    | Auth      |
| POST   | `/api/chat/conversations/:id/messages`    | Auth      |

---

## Sistema de roles

| Rol        | Descripción                                     |
|------------|-------------------------------------------------|
| `customer` | Cliente registrado. Crea pedidos, paga, chatea  |
| `operator` | Gestiona pedidos, ofertas, envíos y proveedores |
| `manager`  | Todo lo anterior + gestión de personal          |
| `admin`    | Acceso total                                    |

---

## Flujo principal de negocio

```
1. Cliente se registra         POST /api/auth/register
2. Cliente inicia sesión       POST /api/auth/login  →  JWT
3. Cliente solicita producto   POST /api/orders
4. Operador busca proveedor    PUT  /api/orders/:id/supplier
5. Operador crea oferta        POST /api/offers
6. Cliente acepta la oferta    POST /api/offers/:id/accept
7. Cliente paga                POST /api/payments/pay
8. Operador crea el envío      POST /api/shipments
9. Operador actualiza estado   PUT  /api/shipments/:id/status
10. Estado llega a delivered → pedido completado
```

## Pasarela de pago simulada

No se usa ninguna pasarela real. Las tarjetas válidas se definen en `.env`:

```env
VALID_CARDS=4111111111111111,5500005555555554,4000000000000002
```

Cualquier número de tarjeta que no esté en esa lista será rechazado.

## Health checks

Cada servicio expone `GET /health`:

```bash
curl http://localhost:3000/health   # gateway
curl http://localhost:3001/health   # auth-service
curl http://localhost:3002/health   # user-service
# ...
```
