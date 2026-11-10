-- =====================================================================
--  FARMASTOCK - Datos de ejemplo
--  Ejecutar después de 01_esquema.sql
--  Las fechas de vencimiento son relativas a la fecha actual para que
--  las alertas del semáforo siempre muestren casos de prueba.
-- =====================================================================
BEGIN;
SET search_path TO farmastock, public;

-- Usuarios (contraseña de ejemplo para todos: VitalClin2026)
SELECT fn_crear_usuario('Propietaria VitalClin', 'admin@vitalclin.bo',   'VitalClin2026', 'administrador');
SELECT fn_crear_usuario('Shirley Fernanda',      'shirley@vitalclin.bo', 'VitalClin2026', 'regente');
SELECT fn_crear_usuario('Personal Mostrador',    'ventas@vitalclin.bo',  'VitalClin2026', 'vendedor');

INSERT INTO categorias (nombre, descripcion, icono) VALUES
  ('Analgésicos y antipiréticos', 'Alivio del dolor y la fiebre',           '💊'),
  ('Antibióticos',                'Tratamiento de infecciones bacterianas', '🧫'),
  ('Antiinflamatorios',           'Reducen inflamación y dolor',            '🩹'),
  ('Antialérgicos',               'Antihistamínicos',                       '🤧'),
  ('Gastrointestinales',          'Acidez, diarrea, digestión',             '🫃'),
  ('Vitaminas y suplementos',     'Complementos nutricionales',             '🍊'),
  ('Psicotrópicos',               'Venta bajo receta archivada (SEDES)',    '🧠'),
  ('Cuidado personal',            'Higiene y primeros auxilios',            '🧴');

INSERT INTO formas_farmaceuticas (nombre) VALUES
  ('Tableta'), ('Cápsula'), ('Jarabe'), ('Suspensión'), ('Inyectable'),
  ('Crema'), ('Gotas'), ('Sobre'), ('Solución');

INSERT INTO laboratorios (nombre) VALUES
  ('BAGÓ'), ('COFAR'), ('TERBOL'), ('INTI'), ('Alcos'), ('Vita');

INSERT INTO proveedores (razon_social, nit, contacto, telefono) VALUES
  ('Droguería INTI S.A.',       '1020304050', 'Ventas Santa Cruz', '+591 3 3000001'),
  ('Laboratorios BAGÓ de Bolivia', '1020304051', 'Ejecutivo de cuenta', '+591 3 3000002'),
  ('COFAR S.A.',                '1020304052', 'Distribución',       '+591 3 3000003'),
  ('TERBOL S.A.',               '1020304053', 'Distribución',       '+591 3 3000004');

INSERT INTO productos (codigo, nombre_comercial, principio_activo, concentracion, presentacion,
                       id_forma, id_categoria, id_laboratorio, registro_sanitario,
                       precio_venta, stock_minimo, requiere_receta, es_controlado) VALUES
  ('MED-001','Paracetamol INTI','Paracetamol','500 mg','Caja x 100 tabletas', 1, 1, 4, 'NN-12345/2022', 0.50, 10, FALSE, FALSE),
  ('MED-002','Ibuprofeno BAGÓ','Ibuprofeno','400 mg','Caja x 20 tabletas',    1, 3, 1, 'NN-23456/2021', 1.00, 10, FALSE, FALSE),
  ('MED-003','Amoxicilina COFAR','Amoxicilina','500 mg','Caja x 21 cápsulas', 2, 2, 2, 'NN-34567/2023', 1.50, 10, TRUE,  FALSE),
  ('MED-004','Loratadina TERBOL','Loratadina','10 mg','Caja x 10 tabletas',   1, 4, 3, 'NN-45678/2022', 1.20, 10, FALSE, FALSE),
  ('MED-005','Omeprazol BAGÓ','Omeprazol','20 mg','Caja x 14 cápsulas',       2, 5, 1, 'NN-56789/2023', 1.80, 10, FALSE, FALSE),
  ('MED-006','Vitamina C Vita','Ácido ascórbico','1 g','Tubo x 10 efervescentes',1, 6, 6, 'NN-67890/2024', 2.50, 5, FALSE, FALSE),
  ('MED-007','Clonazepam INTI','Clonazepam','2 mg','Caja x 30 tabletas',      1, 7, 4, 'NN-78901/2022', 3.00, 5, TRUE,  TRUE),
  ('MED-008','Jarabe para la tos Alcos','Dextrometorfano','15 mg/5 ml','Frasco 120 ml', 3, 1, 5, 'NN-89012/2023', 25.00, 5, FALSE, FALSE),
  ('MED-009','Diclofenaco COFAR','Diclofenaco sódico','50 mg','Caja x 20 tabletas', 1, 3, 2, 'NN-90123/2021', 0.80, 10, FALSE, FALSE),
  ('MED-010','Sales de rehidratación','Sales de rehidratación oral','27.9 g','Sobre', 8, 5, 3, 'NN-01234/2024', 4.00, 10, FALSE, FALSE);

-- ---------------------------------------------------------------------
-- Compra 1: Droguería INTI (recibida con factura)
-- ---------------------------------------------------------------------
INSERT INTO compras (id_proveedor, id_usuario, fecha_orden, estado)
VALUES (1, 1, CURRENT_DATE - 30, 'enviada');

INSERT INTO compra_detalle (id_compra, id_producto, cantidad_pedida, costo_unitario, porcentaje_margen, numero_lote, fecha_vencimiento) VALUES
  (1, 1, 300, 0.30, 60, 'PI-2401', CURRENT_DATE + INTERVAL '2 months'),   -- rojo: retirar pronto
  (1, 7,  30, 2.00, 50, 'CZ-0915', CURRENT_DATE + INTERVAL '18 months'),
  (1, 1, 200, 0.32, NULL, 'PI-2502', CURRENT_DATE + INTERVAL '20 months');  -- segundo lote (FEFO)

SELECT fn_recibir_compra(1, 1, 'factura', 'F-000123');

-- ---------------------------------------------------------------------
-- Compra 2: BAGÓ (recibida con nota de venta)
-- ---------------------------------------------------------------------
INSERT INTO compras (id_proveedor, id_usuario, fecha_orden, estado)
VALUES (2, 1, CURRENT_DATE - 20, 'enviada');

INSERT INTO compra_detalle (id_compra, id_producto, cantidad_pedida, costo_unitario, porcentaje_margen, numero_lote, fecha_vencimiento) VALUES
  (2, 2, 100, 0.60, 65, 'IB-7781', CURRENT_DATE + INTERVAL '5 months'),   -- amarillo
  (2, 5,   8, 1.10, 60, 'OM-3320', CURRENT_DATE + INTERVAL '24 months');  -- stock bajo

SELECT fn_recibir_compra(2, 1, 'nota_venta', 'NV-4410');

-- ---------------------------------------------------------------------
-- Compra 3: COFAR y TERBOL
-- ---------------------------------------------------------------------
INSERT INTO compras (id_proveedor, id_usuario, fecha_orden, estado) VALUES
  (3, 1, CURRENT_DATE - 15, 'enviada'),
  (4, 1, CURRENT_DATE - 10, 'enviada');

INSERT INTO compra_detalle (id_compra, id_producto, cantidad_pedida, costo_unitario, porcentaje_margen, numero_lote, fecha_vencimiento) VALUES
  (3, 3, 84, 0.90, 66, 'AM-5501', CURRENT_DATE + INTERVAL '14 months'),
  (3, 9, 60, 0.45, 75, 'DC-1102', CURRENT_DATE + INTERVAL '1 month'),     -- rojo
  (4, 4, 50, 0.70, 70, 'LO-8812', CURRENT_DATE + INTERVAL '10 months'),
  (4,10,  6, 2.50, 60, 'SR-0021', CURRENT_DATE + INTERVAL '30 months');   -- stock bajo

SELECT fn_recibir_compra(3, 2, 'factura', 'F-55210');
SELECT fn_recibir_compra(4, 2, 'factura', 'F-99012');

-- Compra 4: orden en borrador (pendiente de enviar) - módulo de abastecimiento
INSERT INTO compras (id_proveedor, id_usuario, estado, observaciones)
VALUES (2, 1, 'borrador', 'Reposición quincenal');
INSERT INTO compra_detalle (id_compra, id_producto, cantidad_pedida, costo_unitario) VALUES
  (5, 5, 50, 1.10),
  (5, 6, 30, 1.50);

-- ---------------------------------------------------------------------
-- Ventas (FEFO automático)
-- ---------------------------------------------------------------------
INSERT INTO clientes (nombre, ci_nit, telefono) VALUES ('Juan Pérez', '7654321', '70011122');

INSERT INTO ventas (id_cliente, id_usuario, metodo_pago) VALUES (1, 3, 'qr');
SELECT fn_vender_producto(1, 1, 20);   -- sale del lote PI-2401 (vence primero)
SELECT fn_vender_producto(1, 2, 10);

INSERT INTO ventas (id_usuario, metodo_pago) VALUES (3, 'efectivo');
SELECT fn_vender_producto(2, 9, 12);

-- Venta de controlado con receta archivada
INSERT INTO recetas (numero_receta, fecha_receta, medico_nombre, medico_matricula, paciente_nombre, paciente_ci)
VALUES ('R-0001', CURRENT_DATE, 'Dr. Carlos Rojas', 'MP-4521', 'María López', '6543210');
INSERT INTO ventas (id_usuario, id_receta, metodo_pago) VALUES (2, 1, 'efectivo');
SELECT fn_vender_producto(3, 7, 2);

-- ---------------------------------------------------------------------
-- Conteo físico mensual con una diferencia
-- ---------------------------------------------------------------------
INSERT INTO conteos (id_usuario, observaciones) VALUES (1, 'Conteo mensual');
INSERT INTO conteo_detalle (id_conteo, id_lote, cantidad_sistema, cantidad_fisica, observacion)
SELECT 1, id_lote, cantidad_actual, cantidad_actual - 2, 'Faltan 2 unidades'
  FROM lotes WHERE numero_lote = 'LO-8812';
SELECT fn_cerrar_conteo(1, 1);

-- ---------------------------------------------------------------------
-- Promociones
-- ---------------------------------------------------------------------
INSERT INTO promociones (titulo, descripcion, descuento_pct, fecha_inicio, fecha_fin, motivo) VALUES
  ('Mes de la vitamina C', 'Refuerza tus defensas', 15, CURRENT_DATE, CURRENT_DATE + 30, 'comercial'),
  ('Salida rápida Diclofenaco', 'Lote próximo a vencer', 20, CURRENT_DATE, CURRENT_DATE + 20, 'salida_rapida');

INSERT INTO promocion_items (id_promocion, id_producto, id_lote) VALUES (1, 6, NULL);
INSERT INTO promocion_items (id_promocion, id_producto, id_lote)
SELECT 2, 9, id_lote FROM lotes WHERE numero_lote = 'DC-1102';

-- Consulta desde la web con productos del "carrito"
INSERT INTO consultas (nombre, correo, mensaje, canal)
VALUES ('Ana Suárez', 'ana@example.com', '¿Tienen amoxicilina en suspensión?', 'web');
INSERT INTO consulta_items VALUES (1, 3, 1);

COMMIT;
