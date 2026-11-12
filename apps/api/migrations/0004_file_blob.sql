-- Sunucusuz kurulumda ek anahtar gerektirmeyen dosya deposu (bayt içeriği veritabanında, yalnızca API üzerinden erişilir).
CREATE TABLE file_blob (
  storage_key text PRIMARY KEY,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
