-- Las carpetas agregadas (ej. "DON BOSCO") pasan a ser POR PARROQUIA en vez
-- de compartidas entre todas — antes una carpeta cargada para Merced
-- aparecía también en María Auxiliadora, San Cayetano, etc. Los
-- tiempos/temas litúrgicos (Adviento, Cuaresma...) siguen compartidos,
-- porque esos sí son los mismos en cualquier parroquia.
--
-- Importante: las carpetas que ya tenías cargadas (con la clave primaria
-- vieja, sin `space`) quedan "huérfanas" después de esto — el código ya no
-- las va a encontrar para ninguna parroquia, porque no hay forma de saber
-- a cuál pertenecía cada una. Vas a tener que volver a agregarlas una vez
-- más, esta vez desde la parroquia correspondiente (⚙️ tocá "+ Nueva
-- carpeta" desde esa parroquia en particular). No hace falta borrar las
-- filas viejas a mano, quedan sin usarse.
alter table custom_labels add column if not exists space text not null default '';

alter table custom_labels drop constraint if exists custom_labels_pkey;
alter table custom_labels add primary key (kind, name, space);
