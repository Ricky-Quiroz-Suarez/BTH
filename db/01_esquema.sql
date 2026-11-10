-- =====================================================================
--  FARMASTOCK - Sistema de Gestión de Inventario Farmacéutico
--  Farmacia "VitalClin" - Puerto Quijarro, Bolivia
--  Base de datos PostgreSQL (probado en PostgreSQL 16)
--
--  Uso:
--    createdb farmastock
--    psql -d farmastock -f 01_esquema.sql
--    psql -d farmastock -f 02_datos_ejemplo.sql   (opcional)
--
--  Módulos cubiertos:
--    1. Seguridad y acceso (usuarios, roles, contraseñas cifradas)
--    2. Catálogo (categorías terapéuticas, laboratorios, formas
--       farmacéuticas, medicamentos)
--    3. Inventario por lotes (FEFO) y kardex de movimientos
--    4. Abastecimiento (proveedores, órdenes de compra, recepción)
--    5. Ventas / dispensación con receta y control de psicotrópicos
--    6. Conteo físico mensual y ajustes
--    7. Promociones (salida rápida de productos por vencer)
--    8. Consultas de clientes (formulario de contacto / WhatsApp)
--    9. Alertas: stock mínimo (<= 10) y vencimiento (<= 6 meses)
-- =====================================================================

BEGIN;

DROP SCHEMA IF EXISTS farmastock CASCADE;
CREATE SCHEMA farmastock;
SET search_path TO farmastock, public;

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- para cifrar contraseñas (crypt / gen_salt)

-- ---------------------------------------------------------------------
-- 0. PARÁMETROS GENERALES DEL SISTEMA
-- ---------------------------------------------------------------------
-- Valores configurables que usan las alertas. Se guardan aquí para no
-- tener los números "quemados" en el código.
CREATE TABLE parametros (
    clave        VARCHAR(50)  PRIMARY KEY,
    valor        VARCHAR(200) NOT NULL,
    descripcion  TEXT
);

INSERT INTO parametros (clave, valor, descripcion) VALUES
  ('stock_minimo_defecto',   '10', 'Unidades a partir de las cuales se alerta quiebre de stock'),
  ('meses_alerta_venc',      '6',  'Meses antes del vencimiento para alerta amarilla (FEFO)'),
  ('meses_retiro_estante',   '3',  'Meses antes del vencimiento para retirar del estante (alerta roja)'),
  ('nombre_farmacia',        'Farmacia VitalClin', NULL),
  ('direccion',              'Puerto Quijarro, Bolivia', NULL),
  ('whatsapp',               '+591 70000000', NULL),
  ('moneda',                 'Bs', NULL);

-- Función auxiliar para leer un parámetro numérico
CREATE OR REPLACE FUNCTION fn_param_int(p_clave VARCHAR)
RETURNS INTEGER LANGUAGE sql STABLE AS $$
    SELECT valor::INTEGER FROM farmastock.parametros WHERE clave = p_clave;
$$;

-- ---------------------------------------------------------------------
-- 1. SEGURIDAD Y ACCESO
-- ---------------------------------------------------------------------
CREATE TABLE roles (
    id_rol       SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre       VARCHAR(30) NOT NULL UNIQUE,
    descripcion  TEXT
);

INSERT INTO roles (nombre, descripcion) VALUES
  ('administrador', 'Propietaria: acceso total, ajustes de inventario, bajas y usuarios'),
  ('regente',       'Regente farmacéutica: recetas, controlados, recepción de compras'),
  ('vendedor',      'Personal de mostrador: consulta catálogo y registra ventas');

CREATE TABLE usuarios (
    id_usuario     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_rol         SMALLINT     NOT NULL REFERENCES roles(id_rol),
    nombre_completo VARCHAR(120) NOT NULL,
    correo         VARCHAR(120) NOT NULL UNIQUE,
    password_hash  TEXT         NOT NULL,           -- generado con crypt(..., gen_salt('bf'))
    telefono       VARCHAR(20),
    activo         BOOLEAN      NOT NULL DEFAULT TRUE,
    ultimo_acceso  TIMESTAMPTZ,
    creado_en      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    actualizado_en TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_usuarios_correo CHECK (correo ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

-- Registro de inicios de sesión (auditoría de accesos)
CREATE TABLE sesiones_log (
    id_sesion    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_usuario   INTEGER REFERENCES usuarios(id_usuario),
    correo       VARCHAR(120) NOT NULL,
    exito        BOOLEAN NOT NULL,
    ip           VARCHAR(45),
    fecha        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2. CATÁLOGO
-- ---------------------------------------------------------------------
-- Categorías terapéuticas (equivalen a las "categorías" del boceto HTML)
CREATE TABLE categorias (
    id_categoria  SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre        VARCHAR(80) NOT NULL UNIQUE,
    descripcion   VARCHAR(200),
    icono         VARCHAR(10),            -- emoji o código de ícono para la interfaz
    activo        BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE formas_farmaceuticas (
    id_forma   SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre     VARCHAR(50) NOT NULL UNIQUE      -- Tableta, Cápsula, Jarabe, Inyectable...
);

-- Laboratorio fabricante (BAGÓ, COFAR, TERBOL, INTI, etc.)
CREATE TABLE laboratorios (
    id_laboratorio SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre         VARCHAR(100) NOT NULL UNIQUE,
    pais           VARCHAR(50) DEFAULT 'Bolivia',
    activo         BOOLEAN NOT NULL DEFAULT TRUE
);

-- Medicamento / producto (dato maestro, sin lote)
CREATE TABLE productos (
    id_producto        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo             VARCHAR(30)  NOT NULL UNIQUE,    -- código interno o código de barras
    nombre_comercial   VARCHAR(120) NOT NULL,
    principio_activo   VARCHAR(150) NOT NULL,
    concentracion      VARCHAR(50),                     -- ej. 500 mg, 120 mg/5 ml
    presentacion       VARCHAR(80),                     -- ej. Caja x 20 tabletas
    id_forma           SMALLINT     REFERENCES formas_farmaceuticas(id_forma),
    id_categoria       SMALLINT     NOT NULL REFERENCES categorias(id_categoria),
    id_laboratorio     SMALLINT     NOT NULL REFERENCES laboratorios(id_laboratorio),
    registro_sanitario VARCHAR(40),                     -- registro AGEMED
    precio_venta       NUMERIC(10,2) NOT NULL CHECK (precio_venta >= 0),
    stock_minimo       INTEGER      NOT NULL DEFAULT 10 CHECK (stock_minimo >= 0),
    requiere_receta    BOOLEAN      NOT NULL DEFAULT FALSE,
    es_controlado      BOOLEAN      NOT NULL DEFAULT FALSE,  -- psicotrópico / estupefaciente (libro SEDES)
    imagen_url         TEXT,
    descripcion        TEXT,
    activo             BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_en          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    actualizado_en     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- un controlado siempre requiere receta
    CONSTRAINT ck_controlado_receta CHECK (NOT es_controlado OR requiere_receta)
);

CREATE INDEX ix_productos_principio  ON productos (lower(principio_activo));
CREATE INDEX ix_productos_nombre     ON productos (lower(nombre_comercial));
CREATE INDEX ix_productos_categoria  ON productos (id_categoria);
CREATE INDEX ix_productos_laboratorio ON productos (id_laboratorio);

-- ---------------------------------------------------------------------
-- 3. ABASTECIMIENTO (proveedores y compras)
-- ---------------------------------------------------------------------
-- Distribuidor autorizado (Droguería INTI, BAGÓ, COFAR, TERBOL...)
CREATE TABLE proveedores (
    id_proveedor  SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    razon_social  VARCHAR(120) NOT NULL UNIQUE,
    nit           VARCHAR(20),
    contacto      VARCHAR(100),
    telefono      VARCHAR(20),
    correo        VARCHAR(120),
    direccion     VARCHAR(200),
    activo        BOOLEAN NOT NULL DEFAULT TRUE
);

-- Orden de compra / ingreso de mercadería.
-- Flujo de estados: borrador -> enviada -> recibida   (o anulada)
-- Al pasar a "recibida" (fn_recibir_compra) se crean los lotes y el stock.
CREATE TABLE compras (
    id_compra          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_proveedor       SMALLINT    NOT NULL REFERENCES proveedores(id_proveedor),
    id_usuario         INTEGER     NOT NULL REFERENCES usuarios(id_usuario),
    fecha_orden        DATE        NOT NULL DEFAULT CURRENT_DATE,
    fecha_recepcion    DATE,
    tipo_comprobante   VARCHAR(15) CHECK (tipo_comprobante IN ('factura','nota_venta')),
    nro_comprobante    VARCHAR(30),
    estado             VARCHAR(12) NOT NULL DEFAULT 'borrador'
                       CHECK (estado IN ('borrador','enviada','recibida','anulada')),
    observaciones      TEXT,
    creado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_compra_recibida CHECK (estado <> 'recibida' OR fecha_recepcion IS NOT NULL)
);

CREATE INDEX ix_compras_proveedor ON compras (id_proveedor);
CREATE INDEX ix_compras_estado    ON compras (estado);

CREATE TABLE compra_detalle (
    id_detalle          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_compra           INTEGER      NOT NULL REFERENCES compras(id_compra) ON DELETE CASCADE,
    id_producto         INTEGER      NOT NULL REFERENCES productos(id_producto),
    cantidad_pedida     INTEGER      NOT NULL CHECK (cantidad_pedida > 0),
    cantidad_recibida   INTEGER      CHECK (cantidad_recibida >= 0),  -- se llena al recibir
    costo_unitario      NUMERIC(10,2) NOT NULL CHECK (costo_unitario >= 0),
    porcentaje_margen   NUMERIC(5,2) CHECK (porcentaje_margen >= 0),  -- "le aumentamos el porcentaje"
    numero_lote         VARCHAR(40),                                  -- obligatorio al recibir
    fecha_vencimiento   DATE,                                         -- obligatorio al recibir
    subtotal            NUMERIC(12,2) GENERATED ALWAYS AS
                        (COALESCE(cantidad_recibida, cantidad_pedida) * costo_unitario) STORED
);

CREATE INDEX ix_compra_detalle_compra ON compra_detalle (id_compra);

-- ---------------------------------------------------------------------
-- 4. INVENTARIO POR LOTES (base del método FEFO)
-- ---------------------------------------------------------------------
CREATE TABLE lotes (
    id_lote            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_producto        INTEGER     NOT NULL REFERENCES productos(id_producto),
    numero_lote        VARCHAR(40) NOT NULL,
    fecha_vencimiento  DATE        NOT NULL,
    costo_unitario     NUMERIC(10,2) NOT NULL CHECK (costo_unitario >= 0),
    cantidad_inicial   INTEGER     NOT NULL CHECK (cantidad_inicial >= 0),
    cantidad_actual    INTEGER     NOT NULL CHECK (cantidad_actual >= 0),  -- nunca negativo
    id_detalle_compra  INTEGER     REFERENCES compra_detalle(id_detalle),
    estado             VARCHAR(12) NOT NULL DEFAULT 'disponible'
                       CHECK (estado IN ('disponible','retirado','vencido','agotado')),
    fecha_ingreso      DATE        NOT NULL DEFAULT CURRENT_DATE,
    UNIQUE (id_producto, numero_lote)
);

CREATE INDEX ix_lotes_fefo ON lotes (id_producto, fecha_vencimiento) WHERE cantidad_actual > 0;
CREATE INDEX ix_lotes_venc ON lotes (fecha_vencimiento);

-- Kardex: TODA variación de stock pasa por aquí.
-- cantidad > 0 = entrada, cantidad < 0 = salida.
-- Un trigger actualiza lotes.cantidad_actual automáticamente.
CREATE TABLE movimientos (
    id_movimiento   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_lote         INTEGER     NOT NULL REFERENCES lotes(id_lote),
    tipo            VARCHAR(25) NOT NULL CHECK (tipo IN (
                        'entrada_compra',        -- recepción de pedido
                        'entrada_inicial',       -- stock inicial al registrar el producto
                        'entrada_ajuste',        -- sobrante en conteo físico
                        'entrada_devol_cliente', -- cliente devuelve
                        'salida_venta',          -- dispensación
                        'salida_ajuste',         -- faltante en conteo físico
                        'salida_vencimiento',    -- baja por caducidad
                        'salida_danado',         -- baja por daño / rotura
                        'salida_devol_proveedor' -- devolución o cambio al proveedor
                    )),
    cantidad        INTEGER     NOT NULL CHECK (cantidad <> 0),
    id_usuario      INTEGER     NOT NULL REFERENCES usuarios(id_usuario),
    id_compra       INTEGER     REFERENCES compras(id_compra),
    id_venta        INTEGER,    -- FK agregada más abajo
    id_conteo       INTEGER,    -- FK agregada más abajo
    motivo          TEXT,
    fecha           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_signo_movimiento CHECK (
        (tipo LIKE 'entrada%' AND cantidad > 0) OR
        (tipo LIKE 'salida%'  AND cantidad < 0)
    )
);

CREATE INDEX ix_movimientos_lote  ON movimientos (id_lote);
CREATE INDEX ix_movimientos_fecha ON movimientos (fecha);

-- ---------------------------------------------------------------------
-- 5. VENTAS / DISPENSACIÓN
-- ---------------------------------------------------------------------
CREATE TABLE clientes (
    id_cliente     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre         VARCHAR(120) NOT NULL,
    ci_nit         VARCHAR(20),
    telefono       VARCHAR(20),
    correo         VARCHAR(120),
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Receta médica (obligatoria para productos con requiere_receta)
CREATE TABLE recetas (
    id_receta          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero_receta      VARCHAR(30),
    fecha_receta       DATE        NOT NULL,
    medico_nombre      VARCHAR(120) NOT NULL,
    medico_matricula   VARCHAR(30),
    paciente_nombre    VARCHAR(120) NOT NULL,
    paciente_ci        VARCHAR(20),
    archivada          BOOLEAN     NOT NULL DEFAULT TRUE,   -- receta física archivada
    imagen_url         TEXT,                                -- foto/escaneo opcional
    creado_en          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ventas (
    id_venta        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_cliente      INTEGER     REFERENCES clientes(id_cliente),   -- NULL = consumidor final
    id_usuario      INTEGER     NOT NULL REFERENCES usuarios(id_usuario),
    id_receta       INTEGER     REFERENCES recetas(id_receta),
    fecha           TIMESTAMPTZ NOT NULL DEFAULT now(),
    metodo_pago     VARCHAR(15) NOT NULL DEFAULT 'efectivo'
                    CHECK (metodo_pago IN ('efectivo','qr','tarjeta','transferencia')),
    estado          VARCHAR(10) NOT NULL DEFAULT 'completada'
                    CHECK (estado IN ('completada','anulada'))
);

CREATE INDEX ix_ventas_fecha ON ventas (fecha);

-- Una línea por lote usado (FEFO puede repartir un pedido en varios lotes)
CREATE TABLE venta_detalle (
    id_detalle      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_venta        INTEGER      NOT NULL REFERENCES ventas(id_venta) ON DELETE CASCADE,
    id_producto     INTEGER      NOT NULL REFERENCES productos(id_producto),
    id_lote         INTEGER      NOT NULL REFERENCES lotes(id_lote),
    cantidad        INTEGER      NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC(10,2) NOT NULL CHECK (precio_unitario >= 0),
    descuento_pct   NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (descuento_pct BETWEEN 0 AND 100),
    subtotal        NUMERIC(12,2) GENERATED ALWAYS AS
                    (ROUND(cantidad * precio_unitario * (1 - descuento_pct / 100), 2)) STORED
);

CREATE INDEX ix_venta_detalle_venta ON venta_detalle (id_venta);

ALTER TABLE movimientos
    ADD CONSTRAINT fk_mov_venta FOREIGN KEY (id_venta) REFERENCES ventas(id_venta);

-- ---------------------------------------------------------------------
-- 6. CONTEO FÍSICO (inventario mensual) Y AJUSTES
-- ---------------------------------------------------------------------
CREATE TABLE conteos (
    id_conteo     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fecha         DATE        NOT NULL DEFAULT CURRENT_DATE,
    id_usuario    INTEGER     NOT NULL REFERENCES usuarios(id_usuario),
    estado        VARCHAR(10) NOT NULL DEFAULT 'abierto'
                  CHECK (estado IN ('abierto','cerrado')),
    observaciones TEXT
);

CREATE TABLE conteo_detalle (
    id_conteo        INTEGER NOT NULL REFERENCES conteos(id_conteo) ON DELETE CASCADE,
    id_lote          INTEGER NOT NULL REFERENCES lotes(id_lote),
    cantidad_sistema INTEGER NOT NULL,              -- lo que decía el sistema al contar
    cantidad_fisica  INTEGER NOT NULL CHECK (cantidad_fisica >= 0),
    diferencia       INTEGER GENERATED ALWAYS AS (cantidad_fisica - cantidad_sistema) STORED,
    observacion      TEXT,
    PRIMARY KEY (id_conteo, id_lote)
);

ALTER TABLE movimientos
    ADD CONSTRAINT fk_mov_conteo FOREIGN KEY (id_conteo) REFERENCES conteos(id_conteo);

-- ---------------------------------------------------------------------
-- 7. PROMOCIONES (sección "Promociones" del boceto)
-- ---------------------------------------------------------------------
CREATE TABLE promociones (
    id_promocion   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    titulo         VARCHAR(120) NOT NULL,
    descripcion    TEXT,
    descuento_pct  NUMERIC(5,2) NOT NULL CHECK (descuento_pct > 0 AND descuento_pct <= 100),
    fecha_inicio   DATE NOT NULL,
    fecha_fin      DATE NOT NULL,
    motivo         VARCHAR(20) NOT NULL DEFAULT 'comercial'
                   CHECK (motivo IN ('comercial','salida_rapida')),  -- salida_rapida = por vencer
    activo         BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT ck_promo_fechas CHECK (fecha_fin >= fecha_inicio)
);

-- Una promoción puede aplicar a productos completos o a un lote específico
CREATE TABLE promocion_items (
    id_item       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_promocion  INTEGER NOT NULL REFERENCES promociones(id_promocion) ON DELETE CASCADE,
    id_producto   INTEGER NOT NULL REFERENCES productos(id_producto),
    id_lote       INTEGER REFERENCES lotes(id_lote),
    UNIQUE (id_promocion, id_producto, id_lote)
);

-- ---------------------------------------------------------------------
-- 8. CONSULTAS DE CLIENTES (formulario "Contáctanos" / carrito WhatsApp)
-- ---------------------------------------------------------------------
CREATE TABLE consultas (
    id_consulta   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre        VARCHAR(120) NOT NULL,
    correo        VARCHAR(120),
    telefono      VARCHAR(20),
    mensaje       TEXT NOT NULL,
    canal         VARCHAR(10) NOT NULL DEFAULT 'web' CHECK (canal IN ('web','whatsapp')),
    atendida      BOOLEAN NOT NULL DEFAULT FALSE,
    id_usuario_atiende INTEGER REFERENCES usuarios(id_usuario),
    fecha         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Productos que el cliente agregó al "carrito" antes de consultar
CREATE TABLE consulta_items (
    id_consulta  INTEGER NOT NULL REFERENCES consultas(id_consulta) ON DELETE CASCADE,
    id_producto  INTEGER NOT NULL REFERENCES productos(id_producto),
    cantidad     INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
    PRIMARY KEY (id_consulta, id_producto)
);

-- =====================================================================
--  FUNCIONES Y TRIGGERS
-- =====================================================================

-- Mantener actualizado_en
CREATE OR REPLACE FUNCTION tg_actualizado_en()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.actualizado_en := now();
    RETURN NEW;
END $$;

CREATE TRIGGER tr_usuarios_upd  BEFORE UPDATE ON usuarios  FOR EACH ROW EXECUTE FUNCTION tg_actualizado_en();
CREATE TRIGGER tr_productos_upd BEFORE UPDATE ON productos FOR EACH ROW EXECUTE FUNCTION tg_actualizado_en();

-- Cada movimiento actualiza el stock del lote (el CHECK >= 0 impide negativos)
CREATE OR REPLACE FUNCTION tg_movimiento_actualiza_stock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_nuevo INTEGER;
BEGIN
    UPDATE lotes
       SET cantidad_actual = cantidad_actual + NEW.cantidad
     WHERE id_lote = NEW.id_lote
    RETURNING cantidad_actual INTO v_nuevo;

    IF v_nuevo IS NULL THEN
        RAISE EXCEPTION 'Lote % no existe', NEW.id_lote;
    END IF;

    -- estado automático del lote
    UPDATE lotes
       SET estado = CASE
                      WHEN v_nuevo = 0 AND estado = 'disponible' THEN 'agotado'
                      WHEN v_nuevo > 0 AND estado = 'agotado'    THEN 'disponible'
                      ELSE estado
                    END
     WHERE id_lote = NEW.id_lote;

    RETURN NEW;
END $$;

CREATE TRIGGER tr_movimientos_stock
AFTER INSERT ON movimientos
FOR EACH ROW EXECUTE FUNCTION tg_movimiento_actualiza_stock();

-- Los movimientos son históricos: no se editan ni se borran (se corrigen con otro movimiento)
CREATE OR REPLACE FUNCTION tg_bloquear_cambios()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'El kardex no se modifica: registre un movimiento de ajuste';
END $$;

CREATE TRIGGER tr_movimientos_inmutable
BEFORE UPDATE OR DELETE ON movimientos
FOR EACH ROW EXECUTE FUNCTION tg_bloquear_cambios();

-- ---------------------------------------------------------------------
-- Usuarios: crear y autenticar (contraseña cifrada con bcrypt)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_crear_usuario(
    p_nombre VARCHAR, p_correo VARCHAR, p_password TEXT, p_rol VARCHAR)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
    v_id INTEGER;
BEGIN
    IF length(p_password) < 8 THEN
        RAISE EXCEPTION 'La contraseña debe tener al menos 8 caracteres';
    END IF;

    INSERT INTO usuarios (id_rol, nombre_completo, correo, password_hash)
    VALUES ((SELECT id_rol FROM roles WHERE nombre = p_rol),
            p_nombre, lower(p_correo), crypt(p_password, gen_salt('bf')))
    RETURNING id_usuario INTO v_id;
    RETURN v_id;
END $$;

-- Devuelve el id_usuario si las credenciales son correctas, NULL si no.
CREATE OR REPLACE FUNCTION fn_login(p_correo VARCHAR, p_password TEXT, p_ip VARCHAR DEFAULT NULL)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
    v_id INTEGER;
BEGIN
    SELECT id_usuario INTO v_id
      FROM usuarios
     WHERE correo = lower(p_correo)
       AND activo
       AND password_hash = crypt(p_password, password_hash);

    INSERT INTO sesiones_log (id_usuario, correo, exito, ip)
    VALUES (v_id, lower(p_correo), v_id IS NOT NULL, p_ip);

    IF v_id IS NOT NULL THEN
        UPDATE usuarios SET ultimo_acceso = now() WHERE id_usuario = v_id;
    END IF;
    RETURN v_id;
END $$;

-- ---------------------------------------------------------------------
-- Recepción de una compra: crea lotes, registra entradas y,
-- si viene porcentaje de margen, actualiza el precio de venta.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_recibir_compra(
    p_id_compra INTEGER, p_id_usuario INTEGER,
    p_tipo_comprobante VARCHAR DEFAULT NULL, p_nro_comprobante VARCHAR DEFAULT NULL)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
    d        RECORD;
    v_lote   INTEGER;
    v_cant   INTEGER;
    v_lineas INTEGER := 0;
    v_estado VARCHAR;
BEGIN
    SELECT estado INTO v_estado FROM compras WHERE id_compra = p_id_compra FOR UPDATE;
    IF v_estado IS NULL THEN
        RAISE EXCEPTION 'La compra % no existe', p_id_compra;
    ELSIF v_estado IN ('recibida','anulada') THEN
        RAISE EXCEPTION 'La compra % ya está %', p_id_compra, v_estado;
    END IF;

    FOR d IN SELECT * FROM compra_detalle WHERE id_compra = p_id_compra LOOP
        v_cant := COALESCE(d.cantidad_recibida, d.cantidad_pedida);
        CONTINUE WHEN v_cant = 0;   -- no llegó nada de este producto

        IF d.numero_lote IS NULL OR d.fecha_vencimiento IS NULL THEN
            RAISE EXCEPTION 'Producto %: falta número de lote o fecha de vencimiento', d.id_producto;
        END IF;
        IF d.fecha_vencimiento <= CURRENT_DATE THEN
            RAISE EXCEPTION 'Producto %: el lote % ya está vencido', d.id_producto, d.numero_lote;
        END IF;

        -- si el lote ya existe (misma partida en otra compra) se suma; si no, se crea
        SELECT id_lote INTO v_lote FROM lotes
         WHERE id_producto = d.id_producto AND numero_lote = d.numero_lote;

        IF v_lote IS NULL THEN
            INSERT INTO lotes (id_producto, numero_lote, fecha_vencimiento, costo_unitario,
                               cantidad_inicial, cantidad_actual, id_detalle_compra)
            VALUES (d.id_producto, d.numero_lote, d.fecha_vencimiento, d.costo_unitario,
                    v_cant, 0, d.id_detalle)
            RETURNING id_lote INTO v_lote;
        ELSE
            UPDATE lotes SET cantidad_inicial = cantidad_inicial + v_cant WHERE id_lote = v_lote;
        END IF;

        INSERT INTO movimientos (id_lote, tipo, cantidad, id_usuario, id_compra, motivo)
        VALUES (v_lote, 'entrada_compra', v_cant, p_id_usuario, p_id_compra, 'Recepción de compra');

        UPDATE compra_detalle SET cantidad_recibida = v_cant WHERE id_detalle = d.id_detalle;

        IF d.porcentaje_margen IS NOT NULL THEN
            UPDATE productos
               SET precio_venta = ROUND(d.costo_unitario * (1 + d.porcentaje_margen / 100), 2)
             WHERE id_producto = d.id_producto;
        END IF;

        v_lineas := v_lineas + 1;
    END LOOP;

    IF v_lineas = 0 THEN
        RAISE EXCEPTION 'La compra % no tiene productos para recibir', p_id_compra;
    END IF;

    UPDATE compras
       SET estado = 'recibida',
           fecha_recepcion = CURRENT_DATE,
           tipo_comprobante = COALESCE(p_tipo_comprobante, tipo_comprobante),
           nro_comprobante  = COALESCE(p_nro_comprobante,  nro_comprobante)
     WHERE id_compra = p_id_compra;

    RETURN v_lineas;
END $$;

-- ---------------------------------------------------------------------
-- Dispensación FEFO: descuenta la cantidad pedida empezando por el lote
-- que vence primero. No usa lotes vencidos ni retirados.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_vender_producto(
    p_id_venta INTEGER, p_id_producto INTEGER, p_cantidad INTEGER,
    p_descuento_pct NUMERIC DEFAULT NULL)   -- NULL = aplicar promociones vigentes
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    l          RECORD;
    v_restante INTEGER := p_cantidad;
    v_tomar    INTEGER;
    v_precio   NUMERIC(10,2);
    v_receta   BOOLEAN;
    v_usuario  INTEGER;
    v_id_receta INTEGER;
    v_disp     INTEGER;
    v_desc     NUMERIC(5,2);
BEGIN
    IF p_cantidad <= 0 THEN
        RAISE EXCEPTION 'La cantidad debe ser mayor a cero';
    END IF;

    SELECT precio_venta, requiere_receta INTO v_precio, v_receta
      FROM productos WHERE id_producto = p_id_producto AND activo;
    IF v_precio IS NULL THEN
        RAISE EXCEPTION 'Producto % no existe o está inactivo', p_id_producto;
    END IF;

    SELECT id_usuario, id_receta INTO v_usuario, v_id_receta
      FROM ventas WHERE id_venta = p_id_venta AND estado = 'completada';
    IF v_usuario IS NULL THEN
        RAISE EXCEPTION 'Venta % no existe o está anulada', p_id_venta;
    END IF;
    IF v_receta AND v_id_receta IS NULL THEN
        RAISE EXCEPTION 'El producto % requiere receta médica', p_id_producto;
    END IF;

    SELECT COALESCE(SUM(cantidad_actual),0) INTO v_disp
      FROM lotes
     WHERE id_producto = p_id_producto AND estado = 'disponible'
       AND fecha_vencimiento > CURRENT_DATE;
    IF v_disp < p_cantidad THEN
        RAISE EXCEPTION 'Stock insuficiente: disponible %, solicitado %', v_disp, p_cantidad;
    END IF;

    FOR l IN
        SELECT id_lote, cantidad_actual FROM lotes
         WHERE id_producto = p_id_producto AND estado = 'disponible'
           AND cantidad_actual > 0 AND fecha_vencimiento > CURRENT_DATE
         ORDER BY fecha_vencimiento, id_lote          -- FEFO
         FOR UPDATE
    LOOP
        EXIT WHEN v_restante = 0;
        v_tomar := LEAST(l.cantidad_actual, v_restante);

        -- descuento: el indicado, o la mejor promoción vigente del producto o de este lote
        v_desc := COALESCE(p_descuento_pct, (
            SELECT MAX(pr.descuento_pct)
              FROM promocion_items pi
              JOIN promociones pr ON pr.id_promocion = pi.id_promocion
             WHERE pi.id_producto = p_id_producto
               AND (pi.id_lote IS NULL OR pi.id_lote = l.id_lote)
               AND pr.activo AND CURRENT_DATE BETWEEN pr.fecha_inicio AND pr.fecha_fin), 0);

        INSERT INTO venta_detalle (id_venta, id_producto, id_lote, cantidad, precio_unitario, descuento_pct)
        VALUES (p_id_venta, p_id_producto, l.id_lote, v_tomar, v_precio, v_desc);

        INSERT INTO movimientos (id_lote, tipo, cantidad, id_usuario, id_venta, motivo)
        VALUES (l.id_lote, 'salida_venta', -v_tomar, v_usuario, p_id_venta, 'Venta');

        v_restante := v_restante - v_tomar;
    END LOOP;
END $$;

-- Stock inicial (al registrar un producto que ya está en estantería)
CREATE OR REPLACE FUNCTION fn_ingreso_inicial(
    p_id_producto INTEGER, p_numero_lote VARCHAR, p_vencimiento DATE,
    p_costo NUMERIC, p_cantidad INTEGER, p_id_usuario INTEGER)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
    v_lote INTEGER;
BEGIN
    IF p_cantidad <= 0 THEN
        RAISE EXCEPTION 'La cantidad inicial debe ser mayor a cero';
    END IF;
    IF p_vencimiento <= CURRENT_DATE THEN
        RAISE EXCEPTION 'El lote % ya está vencido', p_numero_lote;
    END IF;
    INSERT INTO lotes (id_producto, numero_lote, fecha_vencimiento, costo_unitario,
                       cantidad_inicial, cantidad_actual)
    VALUES (p_id_producto, p_numero_lote, p_vencimiento, p_costo, p_cantidad, 0)
    RETURNING id_lote INTO v_lote;

    INSERT INTO movimientos (id_lote, tipo, cantidad, id_usuario, motivo)
    VALUES (v_lote, 'entrada_inicial', p_cantidad, p_id_usuario, 'Stock inicial');
    RETURN v_lote;
END $$;

-- Anular una venta: devuelve el stock a los mismos lotes
CREATE OR REPLACE FUNCTION fn_anular_venta(p_id_venta INTEGER, p_id_usuario INTEGER, p_motivo TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    d RECORD;
BEGIN
    UPDATE ventas SET estado = 'anulada'
     WHERE id_venta = p_id_venta AND estado = 'completada';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Venta % no existe o ya fue anulada', p_id_venta;
    END IF;

    FOR d IN SELECT id_lote, cantidad FROM venta_detalle WHERE id_venta = p_id_venta LOOP
        INSERT INTO movimientos (id_lote, tipo, cantidad, id_usuario, id_venta, motivo)
        VALUES (d.id_lote, 'entrada_devol_cliente', d.cantidad, p_id_usuario, p_id_venta,
                'Anulación: ' || COALESCE(p_motivo, ''));
    END LOOP;
END $$;

-- Dar de baja un lote completo o parcial (vencido, dañado, devolución al proveedor)
CREATE OR REPLACE FUNCTION fn_baja_lote(
    p_id_lote INTEGER, p_cantidad INTEGER, p_tipo VARCHAR, p_id_usuario INTEGER, p_motivo TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_tipo NOT IN ('salida_vencimiento','salida_danado','salida_devol_proveedor') THEN
        RAISE EXCEPTION 'Tipo de baja no válido: %', p_tipo;
    END IF;
    INSERT INTO movimientos (id_lote, tipo, cantidad, id_usuario, motivo)
    VALUES (p_id_lote, p_tipo, -abs(p_cantidad), p_id_usuario, p_motivo);

    IF p_tipo = 'salida_vencimiento' THEN
        UPDATE lotes SET estado = 'vencido' WHERE id_lote = p_id_lote AND cantidad_actual = 0;
    END IF;
END $$;

-- Cerrar un conteo físico: genera los movimientos de ajuste por diferencia
CREATE OR REPLACE FUNCTION fn_cerrar_conteo(p_id_conteo INTEGER, p_id_usuario INTEGER)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
    d RECORD;
    v_ajustes INTEGER := 0;
BEGIN
    UPDATE conteos SET estado = 'cerrado'
     WHERE id_conteo = p_id_conteo AND estado = 'abierto';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conteo % no existe o ya está cerrado', p_id_conteo;
    END IF;

    FOR d IN SELECT * FROM conteo_detalle WHERE id_conteo = p_id_conteo AND diferencia <> 0 LOOP
        INSERT INTO movimientos (id_lote, tipo, cantidad, id_usuario, id_conteo, motivo)
        VALUES (d.id_lote,
                CASE WHEN d.diferencia > 0 THEN 'entrada_ajuste' ELSE 'salida_ajuste' END,
                d.diferencia, p_id_usuario, p_id_conteo,
                COALESCE(d.observacion, 'Ajuste por conteo físico'));
        v_ajustes := v_ajustes + 1;
    END LOOP;
    RETURN v_ajustes;
END $$;

-- Marca como "vencido" los lotes cuya fecha ya pasó (ejecutar a diario)
CREATE OR REPLACE FUNCTION fn_marcar_vencidos()
RETURNS INTEGER LANGUAGE sql AS $$
    WITH upd AS (
        UPDATE farmastock.lotes SET estado = 'vencido'
         WHERE fecha_vencimiento <= CURRENT_DATE AND estado IN ('disponible','retirado')
        RETURNING 1)
    SELECT count(*)::INTEGER FROM upd;
$$;

-- =====================================================================
--  VISTAS (lo que consume la interfaz)
-- =====================================================================

-- Stock total por producto (solo lotes vendibles)
CREATE OR REPLACE VIEW v_stock_producto AS
SELECT p.id_producto,
       p.codigo,
       p.nombre_comercial,
       p.principio_activo,
       p.concentracion,
       c.nombre  AS categoria,
       lab.nombre AS laboratorio,
       p.precio_venta,
       p.stock_minimo,
       COALESCE(SUM(l.cantidad_actual) FILTER (
           WHERE l.estado = 'disponible' AND l.fecha_vencimiento > CURRENT_DATE), 0)::INTEGER AS stock_disponible,
       MIN(l.fecha_vencimiento) FILTER (
           WHERE l.cantidad_actual > 0 AND l.estado = 'disponible'
             AND l.fecha_vencimiento > CURRENT_DATE) AS proximo_vencimiento
  FROM productos p
  JOIN categorias   c   ON c.id_categoria   = p.id_categoria
  JOIN laboratorios lab ON lab.id_laboratorio = p.id_laboratorio
  LEFT JOIN lotes   l   ON l.id_producto    = p.id_producto
 WHERE p.activo
 GROUP BY p.id_producto, c.nombre, lab.nombre;

-- Catálogo público (sección "Nuestros productos" con buscador y filtro)
CREATE OR REPLACE VIEW v_catalogo AS
SELECT s.id_producto, s.codigo, s.nombre_comercial, s.principio_activo,
       s.concentracion, p.presentacion, f.nombre AS forma_farmaceutica,
       s.categoria, s.laboratorio, s.precio_venta,
       promo.descuento_pct,
       ROUND(s.precio_venta * (1 - COALESCE(promo.descuento_pct,0) / 100), 2) AS precio_final,
       p.requiere_receta, p.imagen_url,
       (s.stock_disponible > 0) AS disponible
  FROM v_stock_producto s
  JOIN productos p ON p.id_producto = s.id_producto
  LEFT JOIN formas_farmaceuticas f ON f.id_forma = p.id_forma
  LEFT JOIN LATERAL (
        SELECT MAX(pr.descuento_pct) AS descuento_pct
          FROM promocion_items pi
          JOIN promociones pr ON pr.id_promocion = pi.id_promocion
         WHERE pi.id_producto = s.id_producto AND pi.id_lote IS NULL
           AND pr.activo AND CURRENT_DATE BETWEEN pr.fecha_inicio AND pr.fecha_fin
  ) promo ON TRUE;

-- ALERTA 1: quiebre de stock (stock <= stock mínimo, por defecto 10)
CREATE OR REPLACE VIEW v_alerta_stock AS
SELECT id_producto, codigo, nombre_comercial, principio_activo, laboratorio,
       stock_disponible, stock_minimo,
       CASE WHEN stock_disponible = 0 THEN 'AGOTADO'
            ELSE 'STOCK BAJO' END AS alerta,
       CASE WHEN stock_disponible = 0 THEN 'rojo'
            ELSE 'amarillo' END AS semaforo
  FROM v_stock_producto
 WHERE stock_disponible <= stock_minimo
 ORDER BY stock_disponible, nombre_comercial;

-- ALERTA 2: semáforo de vencimientos FEFO por lote
--   negro    : ya vencido (dar de baja)
--   rojo     : <= 3 meses -> retirar del estante / devolver al proveedor
--   amarillo : <= 6 meses -> priorizar salida, promoción
--   verde    : > 6 meses
CREATE OR REPLACE VIEW v_semaforo_vencimientos AS
SELECT l.id_lote,
       p.id_producto,
       p.codigo,
       p.nombre_comercial,
       p.principio_activo,
       lab.nombre AS laboratorio,
       l.numero_lote,
       l.fecha_vencimiento,
       l.cantidad_actual,
       (l.fecha_vencimiento - CURRENT_DATE) AS dias_restantes,
       l.cantidad_actual * l.costo_unitario AS valor_en_riesgo,
       CASE
         WHEN l.fecha_vencimiento <= CURRENT_DATE THEN 'negro'
         WHEN l.fecha_vencimiento <= CURRENT_DATE + make_interval(months => fn_param_int('meses_retiro_estante')) THEN 'rojo'
         WHEN l.fecha_vencimiento <= CURRENT_DATE + make_interval(months => fn_param_int('meses_alerta_venc'))    THEN 'amarillo'
         ELSE 'verde'
       END AS semaforo
  FROM lotes l
  JOIN productos p      ON p.id_producto = l.id_producto
  JOIN laboratorios lab ON lab.id_laboratorio = p.id_laboratorio
 WHERE l.cantidad_actual > 0
 ORDER BY l.fecha_vencimiento;

-- Solo los que requieren atención (vence en <= 6 meses o ya vencidos)
CREATE OR REPLACE VIEW v_alerta_vencimiento AS
SELECT * FROM v_semaforo_vencimientos WHERE semaforo <> 'verde';

-- Kardex legible
CREATE OR REPLACE VIEW v_kardex AS
SELECT m.id_movimiento, m.fecha, p.codigo, p.nombre_comercial,
       l.numero_lote, l.fecha_vencimiento, m.tipo,
       CASE WHEN m.cantidad > 0 THEN m.cantidad END  AS entrada,
       CASE WHEN m.cantidad < 0 THEN -m.cantidad END AS salida,
       SUM(m.cantidad) OVER (PARTITION BY m.id_lote ORDER BY m.fecha, m.id_movimiento) AS saldo_lote,
       u.nombre_completo AS usuario, m.motivo
  FROM movimientos m
  JOIN lotes l     ON l.id_lote = m.id_lote
  JOIN productos p ON p.id_producto = l.id_producto
  JOIN usuarios u  ON u.id_usuario = m.id_usuario;

-- Libro de controlados (psicotrópicos) para el reporte trimestral al SEDES
CREATE OR REPLACE VIEW v_libro_controlados AS
SELECT v.fecha, p.nombre_comercial, p.principio_activo, p.concentracion,
       l.numero_lote, vd.cantidad,
       r.numero_receta, r.fecha_receta, r.medico_nombre, r.medico_matricula,
       r.paciente_nombre, r.paciente_ci,
       u.nombre_completo AS dispensado_por,
       EXTRACT(YEAR FROM v.fecha)::INT    AS anio,
       EXTRACT(QUARTER FROM v.fecha)::INT AS trimestre
  FROM venta_detalle vd
  JOIN ventas v    ON v.id_venta = vd.id_venta AND v.estado = 'completada'
  JOIN productos p ON p.id_producto = vd.id_producto AND p.es_controlado
  JOIN lotes l     ON l.id_lote = vd.id_lote
  LEFT JOIN recetas r ON r.id_receta = v.id_receta
  JOIN usuarios u  ON u.id_usuario = v.id_usuario
 ORDER BY v.fecha;

-- Resumen de compras por proveedor
CREATE OR REPLACE VIEW v_compras_resumen AS
SELECT c.id_compra, c.fecha_orden, c.fecha_recepcion, pr.razon_social AS proveedor,
       c.tipo_comprobante, c.nro_comprobante, c.estado,
       COUNT(d.id_detalle)        AS items,
       COALESCE(SUM(d.subtotal),0) AS total
  FROM compras c
  JOIN proveedores pr ON pr.id_proveedor = c.id_proveedor
  LEFT JOIN compra_detalle d ON d.id_compra = c.id_compra
 GROUP BY c.id_compra, pr.razon_social;

-- Sugerencia de pedido: productos en alerta con su último proveedor y costo
CREATE OR REPLACE VIEW v_sugerencia_pedido AS
SELECT a.id_producto, a.codigo, a.nombre_comercial, a.stock_disponible, a.stock_minimo,
       GREATEST(a.stock_minimo * 2 - a.stock_disponible, 1) AS cantidad_sugerida,
       ult.razon_social AS ultimo_proveedor,
       ult.costo_unitario AS ultimo_costo
  FROM v_alerta_stock a
  LEFT JOIN LATERAL (
        SELECT pr.razon_social, d.costo_unitario
          FROM compra_detalle d
          JOIN compras c      ON c.id_compra = d.id_compra AND c.estado = 'recibida'
          JOIN proveedores pr ON pr.id_proveedor = c.id_proveedor
         WHERE d.id_producto = a.id_producto
         ORDER BY c.fecha_recepcion DESC, d.id_detalle DESC
         LIMIT 1
  ) ult ON TRUE;

-- Totales de ventas por día
CREATE OR REPLACE VIEW v_ventas_diarias AS
SELECT v.fecha::DATE AS dia,
       COUNT(DISTINCT v.id_venta) AS nro_ventas,
       SUM(vd.subtotal)           AS total_bs,
       SUM(vd.subtotal - vd.cantidad * l.costo_unitario) AS utilidad_bruta
  FROM ventas v
  JOIN venta_detalle vd ON vd.id_venta = v.id_venta
  JOIN lotes l          ON l.id_lote = vd.id_lote
 WHERE v.estado = 'completada'
 GROUP BY v.fecha::DATE
 ORDER BY dia DESC;

COMMIT;
