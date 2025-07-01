export interface DecodedData {
  userId: string;
  userTag: string;
  avatar: string;
  discordId: string;
  discordName: string;
  discordIconURL: string;
  role: string; // TODO(v3): deprecated, remove when legacy buttons are phased out
  roleName: string; // TODO(v3): deprecated, remove when legacy buttons are phased out
  nonce: string;
  expiry: number;
};
