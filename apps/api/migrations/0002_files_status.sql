-- Dosyalar doğrudan depolamaya yüklenir; sunucu boyut ve içerik imzasını doğrulayınca "ready" olur.
ALTER TABLE file_object ADD COLUMN status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'rejected'));
ALTER TABLE file_object ADD COLUMN ready_at timestamptz;
CREATE INDEX file_object_ws_idx ON file_object (workspace_id, created_at DESC);
