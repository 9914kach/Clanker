import 'dotenv/config';
import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  type Interaction,
} from 'discord.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}`);
    throw new Error(`Missing ${name}`);
  }
  return value;
}

const token = requireEnv('DISCORD_BOT_TOKEN');
const appId = requireEnv('DISCORD_APPLICATION_ID');

const pingCommand = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Svarar med Pong (Clanker bot).')
  .toJSON();

async function registerSlashCommands(): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(Routes.applicationCommands(appId), { body: [pingCommand] });
  console.log('Slash commands registered (global).');
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Ready as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'ping') {
    await interaction.reply({ content: 'Pong!' });
  }
});

async function main(): Promise<void> {
  await registerSlashCommands();
  await client.login(token);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
