-- Redes sociales por parroquia/capilla (Instagram, Facebook, YouTube,
-- WhatsApp): links opcionales que se muestran al fondo de "Inicio" en la
-- página pública, y en una pantalla propia (#/redes) pensada para
-- compartirse directo (ej. en la bio de Instagram) sin pasar primero por
-- la lista de canciones. Correr esto en el SQL Editor de Supabase si el
-- proyecto ya estaba creado antes de este cambio (instalaciones nuevas ya
-- tienen estas columnas en schema.sql).
alter table spaces add column if not exists instagram text not null default '';
alter table spaces add column if not exists facebook text not null default '';
alter table spaces add column if not exists youtube text not null default '';
alter table spaces add column if not exists whatsapp text not null default '';
