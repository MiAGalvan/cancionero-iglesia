-- Fecha de las lecturas del día (1ª Lectura, Salmo, 2ª Lectura, Evangelio):
-- hasta ahora no tenían fecha, así que la página pública siempre las
-- mostraba como "de hoy" aunque el equipo las hubiera cargado con
-- anticipación para una misa programada (ej. el domingo próximo). Con esta
-- columna, cada lectura puede llevar su propia fecha y la página pública
-- avisa si son de hoy o de una fecha futura, igual que ya hace con la lista
-- de canciones publicada. No afecta a los avisos/eventos comunes, que no
-- usan esta columna (queda en null para ellos).
alter table anuncios add column if not exists fecha date;
