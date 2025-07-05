export interface VerifierRole {
  id: number;
  server_id: string;
  server_name: string;
  channel_id: string;
  channel_name: string;
  slug: string | null;
  role_id: string;
  role_name: string | null;
  attribute_key: string | null;
  attribute_value: string | null;
  min_items: number | null;
  message_id: string | null;
  // ...other fields as needed
}
