/**
 * DecodedData interface
 * 
 * Represents the decoded verification payload that contains all necessary
 * information for processing a wallet signature verification request.
 * 
 * This interface is used throughout the verification flow to pass user,
 * Discord server, and verification metadata between services.
 * 
 * The unified verification system handles both legacy and modern rules
 * transparently without requiring legacy-specific fields.
 */
export interface DecodedData {
  address: string;      // Ethereum wallet address being verified
  userId: string;       // Discord user ID
  userTag: string;      // Discord user tag (username#discriminator)
  avatar: string;       // Discord user avatar URL
  discordId: string;    // Discord server/guild ID
  discordName: string;  // Discord server/guild name
  discordIcon: string;  // Discord server/guild icon URL
  nonce: string;        // Cryptographic nonce for replay protection
  expiry: number;       // Unix timestamp when verification expires
};