CREATE TABLE verifier_user_roles (
  id           SERIAL PRIMARY KEY,
  user_id      TEXT   NOT NULL,
  server_id    TEXT   NOT NULL,
  role_id      TEXT   NOT NULL,
  address      TEXT   NOT NULL,
  assigned_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, server_id, role_id)
);
