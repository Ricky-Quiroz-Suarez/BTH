# FarmaStock

Sistema de gestión de inventario farmacéutico para la **Farmacia VitalClin** (Puerto Quijarro).
Lotes con salida FEFO, alertas de vencimiento y de stock mínimo, compras a distribuidores,
punto de venta con recetas y libro de controlados para el SEDES.

- **Backend:** Node.js + Express (JavaScript)
- **Base de datos:** PostgreSQL 13 o superior
- **Frontend:** HTML, CSS y JavaScript sin frameworks (módulos ES)

## Instalación

1. Instale [Node.js](https://nodejs.org) 18 o superior y [PostgreSQL](https://www.postgresql.org/download/).
2. Cree la base de datos (en pgAdmin o en la consola):
   ```bash
   psql -U postgres -c "CREATE DATABASE farmastock"
   ```
3. Copie `.env.example` como `.env` y escriba la contraseña de PostgreSQL en `DATABASE_URL`.
   Cambie también `JWT_SECRET` por un texto largo.
4. Instale las dependencias y cree las tablas:
   ```bash
   npm install
   npm run db:init           # tablas + datos de ejemplo (para probar)
   # o bien
   npm run db:init:limpia    # solo tablas + un usuario administrador (para usar en serio)
   ```
   Ambos comandos **borran** el esquema `farmastock` si ya existía.
5. Inicie el sistema:
   ```bash
   npm start
   ```
   - Sistema interno: http://localhost:3000
   - Catálogo para clientes: http://localhost:3000/catalogo

### Usuarios de ejemplo (contraseña `VitalClin2026`)

| Correo                | Rol            | Puede                                                        |
|-----------------------|----------------|--------------------------------------------------------------|
| admin@vitalclin.bo    | Administrador  | Todo: usuarios, bajas, anular ventas, cerrar conteos         |
| shirley@vitalclin.bo  | Regente        | Compras, recepción, medicamentos, promociones, reportes      |
| ventas@vitalclin.bo   | Vendedor       | Vender, consultar catálogo, lotes y alertas                  |

Cambie las contraseñas en **Ajustes** antes de usar el sistema con datos reales.

## Módulos

| Módulo                 | Qué hace                                                                                   |
|------------------------|--------------------------------------------------------------------------------------------|
| Panel                  | Regla de vencimientos a 12 meses, ventas del día, valor del inventario y faltantes         |
| Vender                 | Punto de venta: descuenta del lote que vence primero (FEFO), pide receta cuando corresponde|
| Alertas                | Lotes para retirar (≤ 3 meses), por vencer (≤ 6 meses) y stock en o bajo el mínimo (10)    |
| Medicamentos           | Catálogo con principio activo, laboratorio, registro sanitario, precio y stock inicial     |
| Lotes y vencimientos   | Semáforo por lote, retirar del estante, dar de baja (vencido, dañado, devolución)          |
| Compras                | Órdenes a INTI, BAGÓ, COFAR, TERBOL…; pedido sugerido; recepción con lote y vencimiento    |
| Conteo físico          | Foto del stock, conteo en estante y ajustes automáticos por diferencia                     |
| Kardex                 | Historial inmutable de entradas y salidas por lote                                         |
| Promociones            | Descuentos por producto o por lote (salida rápida), se aplican solos en caja               |
| Consultas              | Mensajes que dejan los clientes desde el catálogo público                                  |
| Reportes               | Ventas por día, más vendidos, inventario valorizado, libro de controlados (SEDES)          |
| Ajustes                | Usuarios, proveedores, categorías, laboratorios, umbrales de alertas, contraseña           |

## Estructura

```
db/
  01_esquema.sql         tablas, funciones (FEFO, recepción, bajas, conteos), vistas de alertas
  02_datos_ejemplo.sql   datos de prueba con fechas relativas a hoy
scripts/init-db.js       crea la base con npm run db:init
src/
  server.js              servidor Express
  db.js, auth.js         conexión a PostgreSQL y sesiones (JWT + roles)
  errors.js              traduce errores de PostgreSQL a mensajes claros
  routes/                API REST: auth, catalogo, compras, ventas, inventario, admin, publico
public/
  index.html             sistema interno (una sola página)
  catalogo.html          catálogo para clientes
  css/app.css
  js/app.js              menú, sesión y rutas (#/panel, #/ventas…)
  js/api.js, js/ui.js    cliente de la API y utilidades de interfaz
  js/views/              una vista por módulo
```

## Reglas de negocio importantes

- **El stock solo cambia con movimientos.** Compras, ventas, bajas y ajustes generan un
  movimiento en el kardex; un trigger actualiza la cantidad del lote. El kardex no se edita ni se borra.
- **FEFO automático.** `fn_vender_producto` reparte una venta entre lotes empezando por el que
  vence primero; nunca usa lotes vencidos o retirados.
- **Recetas.** Un producto marcado “requiere receta” no se puede vender sin registrar médico y
  paciente. Los controlados aparecen en el libro trimestral y no se muestran en el catálogo público.
- **Lotes vencidos.** Al iniciar el servidor (y cada 6 horas) los lotes vencidos se bloquean para la venta.
- **Umbrales configurables.** Stock mínimo por defecto, meses para alerta amarilla y roja: en Ajustes.

## API (resumen)

Todas las rutas bajo `/api` requieren `Authorization: Bearer <token>`, salvo `/api/auth/login` y `/api/publico/*`.

```
POST /api/auth/login                       GET  /api/dashboard
GET  /api/productos?q=&categoria=&estado=  POST /api/productos   PUT /api/productos/:id
GET  /api/lotes?semaforo=rojo              POST /api/lotes/:id/baja | retirar | reactivar
GET  /api/alertas                          GET  /api/kardex?producto=&tipo=&desde=&hasta=
GET  /api/compras  POST /api/compras       POST /api/compras/:id/enviar | recibir | anular
GET  /api/ventas/buscar?q=                 POST /api/ventas      POST /api/ventas/:id/anular
GET  /api/conteos  POST /api/conteos       PUT  /api/conteos/:id/items   POST /api/conteos/:id/cerrar
GET  /api/reportes/ventas | inventario | controlados
GET  /api/publico/catalogo                 POST /api/publico/consultas
```
