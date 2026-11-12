-- Supabase, public şemasını Data API (PostgREST) ile anon/authenticated rollerine açar.
-- Uygulama bu API'yi kullanmaz; tüm erişim NestJS API'sinden geçer. Bu yüzden:
--  * tüm tablolarda RLS açılır ve hiç politika tanımlanmaz (anon/authenticated için tamamen kapalı),
--  * bu rollerin tablo/sekans yetkileri geri alınır.
-- Tablo sahibi (uygulamanın bağlandığı rol) RLS'ten etkilenmez. Yerel PostgreSQL'de bu roller yoksa atlanır.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
  END IF;
END $$;
