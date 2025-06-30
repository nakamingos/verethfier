CREATE TABLE verifier_roles (
  id             SERIAL PRIMARY KEY,
  server_id      TEXT   NOT NULL,
  server_name    TEXT   NOT NULL,
  channel_id     TEXT   DEFAULT NULL,
  role_id        TEXT   NOT NULL,
  slug           TEXT   DEFAULT 'ALL',
  attribute_key  TEXT,
  attribute_value TEXT,
  min_items      INTEGER,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(
    server_id,
    channel_id, role_id,
    slug, attribute_key, attribute_value
  )
);
