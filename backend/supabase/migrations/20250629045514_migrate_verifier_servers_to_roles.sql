WITH server_channel_map AS (
  VALUES
    ('<SERVER_ID_A>','<VERIFY_CHANNEL_ID_A>'),
    ('<SERVER_ID_B>','<VERIFY_CHANNEL_ID_B>'),
    ('<SERVER_ID_C>','<VERIFY_CHANNEL_ID_C>')
) AS m(server_id, channel_id)

INSERT INTO verifier_roles (
  server_id, server_name, channel_id, role_id
)
SELECT
  vs.id           AS server_id,
  vs.name         AS server_name,
  m.channel_id,
  vs.role_id
FROM verifier_servers vs
LEFT JOIN server_channel_map m
  ON vs.id = m.server_id;
