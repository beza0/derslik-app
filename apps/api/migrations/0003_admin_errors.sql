-- Hata kayıtları: yalnızca teknik bilgi (kod, rota şablonu); istek gövdesi veya kişisel veri yok.
CREATE TABLE app_error (
  id bigserial PRIMARY KEY,
  code text NOT NULL,
  route text,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX app_error_time_idx ON app_error (created_at DESC);

-- Sandbox ödeme oturumu sonucu ve dönem bilgisi
ALTER TABLE checkout_session ADD COLUMN completed_at timestamptz;
