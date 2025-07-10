import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' }); // Load .env from parent directory

if (!process.env.DISCORD_BOT_TOKEN || !process.env.DISCORD_CLIENT_ID) {
  console.error('Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID in environment variables.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {
    // Delete global commands
    const globalCommands = await rest.get(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID)
    );
    for (const command of globalCommands) {
      await rest.delete(
        Routes.applicationCommand(process.env.DISCORD_CLIENT_ID, command.id)
      );
      console.log(`[GLOBAL] Deleted command ${command.name}`);
    }
    console.log('All global commands deleted.');

    // Delete guild-specific commands
    const guildIds = (process.env.GUILD_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
    for (const guildId of guildIds) {
      const guildCommands = await rest.get(
        Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, guildId)
      );
      for (const command of guildCommands) {
        await rest.delete(
          Routes.applicationGuildCommand(process.env.DISCORD_CLIENT_ID, guildId, command.id)
        );
        console.log(`[GUILD ${guildId}] Deleted command ${command.name}`);
      }
      console.log(`All commands deleted for guild ${guildId}.`);
    }
  } catch (err) {
    console.error('Error deleting commands:', err);
  }
})();