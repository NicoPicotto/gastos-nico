-- Categorías fijas (heredadas del Excel). No se editan desde la UI.

insert into grupos (id, nombre, orden, color_slot) values
  (1, 'Hogar y vida', 1, 1),
  (2, 'Tarjeta', 2, 2),
  (3, 'Servicios', 3, 3),
  (4, 'Impuestos', 4, 4),
  (5, 'Auto', 5, 5),
  (6, 'Otros', 6, null),
  (7, 'Ingresos', 7, null);

insert into categorias (id, nombre, grupo_id, tipo, orden) values
  -- Hogar y vida
  (1, 'Supermercado', 1, 'gasto', 1),
  (2, 'Gastos Hogar', 1, 'gasto', 2),
  (3, 'Mascota', 1, 'gasto', 3),
  (4, 'Obra social', 1, 'gasto', 4),
  (5, 'Gym/Deportes', 1, 'gasto', 5),
  (6, 'Gastos Viajes', 1, 'gasto', 6),
  -- Tarjeta (solo el pago del resumen)
  (10, 'Tarjeta crédito', 2, 'gasto', 1),
  -- Servicios
  (20, 'Electricidad', 3, 'gasto', 1),
  (21, 'Internet', 3, 'gasto', 2),
  (22, 'Gas', 3, 'gasto', 3),
  -- Impuestos
  (30, 'Rentas Córdoba', 4, 'gasto', 1),
  (31, 'Monotributo Nico', 4, 'gasto', 2),
  (32, 'Impuestos Municipales - Agua', 4, 'gasto', 3),
  (33, 'Impuestos Municipales - Vivienda', 4, 'gasto', 4),
  (34, 'Bomberos Voluntarios', 4, 'gasto', 5),
  -- Auto
  (40, 'Gastos Auto', 5, 'gasto', 1),
  (41, 'Seguro Auto', 5, 'gasto', 2),
  (42, 'Telepase', 5, 'gasto', 3),
  (43, 'Impuestos Municipales - Automotor', 5, 'gasto', 4),
  -- Otros
  (50, 'Otros', 6, 'gasto', 1),
  -- Ingresos
  (90, 'Sueldo', 7, 'ingreso', 1),
  (91, 'Otros ingresos', 7, 'ingreso', 2);
