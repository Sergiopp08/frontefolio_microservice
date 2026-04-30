# Frontefolio API

API REST para la plataforma Frontefolio — importación de productos de más de 50 países a España.

## Requisitos previos

- [Node.js](https://nodejs.org/) v18 o superior
- [MySQL](https://www.mysql.com/) v8 o superior (corriendo en local o remoto)

## Instalación

```bash
# 1. Entrar en la carpeta
cd frontefolio_api

# 2. Instalar dependencias
npm install

# 3. Crear el archivo de entorno
cp .env.example .env
```

Edita `.env` con tus valores:

```env
PORT=3000

DB_HOST=localhost
DB_PORT=3306
DB_NAME=frontefolio
DB_USER=root
DB_PASSWORD=tu_contraseña

JWT_SECRET=cambia_esto_por_algo_seguro
JWT_EXPIRES_IN=7d

# Tarjetas que el simulador de pago acepta como válidas
VALID_CARDS=4111111111111111,5500005555555554,4000000000000002

FRONTEND_CUSTOMER_URL=http://localhost:5173
FRONTEND_ADMIN_URL=http://localhost:5174
```

## Inicializar la base de datos

Este comando crea la base de datos, todas las tablas y carga los 52 países iniciales:

```bash
npm run db:init
```

Solo es necesario ejecutarlo una vez. Si la base de datos ya existe, el comando es seguro de relanzar (usa `CREATE TABLE IF NOT EXISTS`).

## Arrancar el servidor

```bash
# Desarrollo (recarga automática con nodemon)
npm run dev

# Producción
npm start
```

La API quedará disponible en `http://localhost:3000`.

Para verificar que está corriendo:

```bash
curl http://localhost:3000/health
# { "status": "ok", "timestamp": "..." }
```

## Estructura del proyecto

```
frontefolio_api/
├── server.js               # Punto de entrada
├── package.json
├── .env.example
└── src/
    ├── app.js              # Configuración de Express (middlewares + rutas)
    ├── db/
    │   ├── connection.js   # Pool de conexiones MySQL
    │   ├── schema.sql      # Schema completo de la base de datos
    │   └── init.js         # Script de inicialización (npm run db:init)
    ├── middleware/
    │   ├── auth.js         # Verificación JWT + control de roles
    │   └── errorHandler.js # Manejador global de errores
    └── routes/
        ├── auth.js         # Registro, login, perfil
        ├── inventory.js    # Catálogo de productos
        ├── customers.js    # Gestión de clientes
        ├── staff.js        # Gestión de personal
        ├── orders.js       # Pedidos y solicitudes
        ├── offers.js       # Ofertas al cliente
        ├── payments.js     # Pasarela de pago simulada
        ├── shipments.js    # Seguimiento de envíos
        ├── chat.js         # Chat de soporte
        ├── countries.js    # Países disponibles
        └── suppliers.js    # Proveedores por país
```

## Módulos de la API

| Prefijo              | Descripción                                      |
|----------------------|--------------------------------------------------|
| `/api/auth`          | Registro, login y gestión de sesión              |
| `/api/inventory`     | Catálogo de productos importables                |
| `/api/customers`     | Gestión de clientes                              |
| `/api/staff`         | Gestión de personal interno                      |
| `/api/orders`        | Solicitudes de producto y seguimiento de estado  |
| `/api/offers`        | Ofertas económicas que el cliente acepta/rechaza |
| `/api/payments`      | Pasarela de pago simulada con tarjetas de prueba |
| `/api/shipments`     | Gestión y tracking de envíos                     |
| `/api/chat`          | Chat de soporte cliente ↔ staff                  |
| `/api/countries`     | Listado de países operativos                     |
| `/api/suppliers`     | Proveedores en países de origen                  |

## Sistema de roles

| Rol        | Descripción                                     |
|------------|-------------------------------------------------|
| `customer` | Cliente registrado. Crea pedidos, paga, chatea  |
| `operator` | Gestiona pedidos, ofertas, envíos y proveedores |
| `manager`  | Todo lo anterior + gestión de personal          |
| `admin`    | Acceso total                                    |

## Flujo principal

```
1. Cliente se registra       POST /api/auth/register
2. Cliente inicia sesión     POST /api/auth/login  →  JWT
3. Cliente solicita producto POST /api/orders
4. Operador busca proveedor  PUT  /api/orders/:id/supplier
5. Operador crea oferta      POST /api/offers
6. Cliente acepta la oferta  POST /api/offers/:id/accept
7. Cliente paga              POST /api/payments/pay
8. Operador crea el envío    POST /api/shipments
9. Operador actualiza estado PUT  /api/shipments/:id/status
10. Estado llega a delivered → pedido completado
```

## Pasarela de pago simulada

No se usa ninguna pasarela real. Las tarjetas válidas se definen en `.env`:

```env
VALID_CARDS=4111111111111111,5500005555555554,4000000000000002
```

Cualquier número de tarjeta que no esté en esa lista será rechazado. Puedes añadir o quitar tarjetas sin reiniciar si usas `npm run dev` (nodemon recarga el proceso).

## Documentación de endpoints

La referencia completa de todos los endpoints, bodies y respuestas está en:

```
../API_DOCS.md
```

(Un nivel arriba, en la raíz del proyecto)
