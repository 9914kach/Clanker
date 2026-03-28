import 'dotenv/config';
import { setDefaultResultOrder } from 'node:dns';
import { existsSync } from 'node:fs';

// Broken IPv6 on some Windows setups prevents Discord voice UDP from finishing; prefer A records first.
if (process.platform === 'win32' && process.env.DISCORD_VOICE_IPV4_FIRST !== '0') {
  setDefaultResultOrder('ipv4first');
}
import {
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Interaction,
} from 'discord.js';
import { initDb, closeDb } from './db.js';
import { prepareDiscordVoiceCrypto } from './voice-setup.js';
import { registerVoiceTracker } from './voice-tracker.js';
import { enqueue, skip, pause, resume, stop, initPlayDl, getLastChannelId } from './music-player.js';
import { startMusicHttpServer } from './music-http.js';
import { getPool } from './db.js';

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
const databaseUrl = requireEnv('DATABASE_URL');
const musicHttpPort = Number(process.env.MUSIC_BOT_HTTP_PORT ?? '3012');

/** In default Docker bridge, Discord voice UDP rarely works; warn once at boot (Pi: discord-bot-host; PC: npm run bot:dev). */
function warnDockerBridgeVoice(): void {
  if (!existsSync('/.dockerenv')) return;
  if (process.env.DISCORD_BOT_VOICE_ALLOW_BRIDGE === '1') return;
  console.warn(
    '[music] Kör i container (bridge): Discord-röst/musik fungerar oftast inte här. Linux/Pi: profil discord-host + discord-bot-host. Windows/macOS Docker Desktop: `npm run bot:dev` på värden. Sätt DISCORD_BOT_VOICE_ALLOW_BRIDGE=1 för att dölja denna varning.',
  );
}

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Svarar med Pong (Clanker bot).')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Spela en låt eller lägg till i kön.')
    .addStringOption((o) =>
      o.setName('query').setDescription('YouTube/Spotify/SoundCloud URL eller sökterm').setRequired(true),
    )
    .toJSON(),

  new SlashCommandBuilder().setName('skip').setDescription('Hoppa till nästa låt i kön.').toJSON(),
  new SlashCommandBuilder().setName('pause').setDescription('Pausa uppspelningen.').toJSON(),
  new SlashCommandBuilder().setName('resume').setDescription('Återuppta uppspelningen.').toJSON(),
  new SlashCommandBuilder().setName('stop').setDescription('Stoppa musiken och töm kön.').toJSON(),

  new SlashCommandBuilder().setName('queue').setDescription('Visa nuvarande kö.').toJSON(),
];

async function registerSlashCommands(): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token);
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: commands });
    console.log(`Slash commands registered (guild ${guildId}).`);
  } else {
    await rest.put(Routes.applicationCommands(appId), { body: commands });
    console.log('Slash commands registered (global).');
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    // GUILD_VOICE_STATES — voice channel updates, @discordjs/voice adapter, /play (user’s voice channel), voice-tracker
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Ready as ${c.user.tag}`);
});

client.on('error', (err) => {
  console.error('[discord] Client error:', err.message);
});

async function handlePlay(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = interaction.guild?.members.cache.get(interaction.user.id);
  const channelId = member?.voice.channelId ?? getLastChannelId(interaction.guildId!);
  if (!channelId) {
    await interaction.reply({ content: '❌ Du måste vara i en röstkanal.', flags: 64 });
    return;
  }
  await interaction.deferReply({ flags: 64 });
  const query = interaction.options.getString('query', true);
  try {
    const track = await enqueue(client, interaction.guildId!, query, interaction.user.id, channelId);
    if (!track) {
      await interaction.editReply('❌ Kunde inte hitta låten. Prova med en annan sökning.');
      return;
    }
    await interaction.editReply(`▶️ **${track.title}**${track.artist ? ` — ${track.artist}` : ''} lades till i kön.`);
  } catch (err) {
    console.error('[music] enqueue error:', err);
    await interaction.editReply(`❌ Fel: ${(err as Error).message}`);
  }
}

async function handleQueue(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: 64 });
  const pool = getPool();
  const [nowRes, queueRes] = await Promise.all([
    pool.query<{ title: string; artist: string | null; is_paused: boolean }>(
      'SELECT title, artist, is_paused FROM bot.music_now_playing WHERE guild_id = $1',
      [interaction.guildId],
    ),
    pool.query<{ title: string; artist: string | null }>(
      'SELECT title, artist FROM bot.music_queue WHERE guild_id = $1 ORDER BY added_at LIMIT 10',
      [interaction.guildId],
    ),
  ]);

  if (!nowRes.rows.length) {
    await interaction.editReply('📭 Inget spelas just nu.');
    return;
  }

  const now = nowRes.rows[0];
  const embed = new EmbedBuilder()
    .setTitle('🎵 Musikköen')
    .addFields({
      name: now.is_paused ? '⏸ Pausad' : '▶️ Spelar nu',
      value: `**${now.title}**${now.artist ? ` — ${now.artist}` : ''}`,
    });

  if (queueRes.rows.length) {
    embed.addFields({
      name: 'Kö',
      value: queueRes.rows.map((r, i) => `${i + 1}. **${r.title}**${r.artist ? ` — ${r.artist}` : ''}`).join('\n'),
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  switch (interaction.commandName) {
    case 'ping':
      await interaction.reply({ content: 'Pong!', flags: 64 });
      break;
    case 'play':
      await handlePlay(interaction);
      break;
    case 'skip':
      await skip(interaction.guildId!);
      await interaction.reply({ content: '⏭ Hoppade till nästa låt.', flags: 64 });
      break;
    case 'pause':
      await pause(interaction.guildId!);
      await interaction.reply({ content: '⏸ Pausad.', flags: 64 });
      break;
    case 'resume':
      await resume(interaction.guildId!);
      await interaction.reply({ content: '▶️ Återupptog uppspelningen.', flags: 64 });
      break;
    case 'stop':
      await stop(interaction.guildId!);
      await interaction.reply({ content: '⏹ Stoppad och kön tömd.', flags: 64 });
      break;
    case 'queue':
      await handleQueue(interaction);
      break;
  }
});

process.on('SIGTERM', async () => {
  client.destroy();
  await closeDb();
  process.exit(0);
});

async function main(): Promise<void> {
  await prepareDiscordVoiceCrypto();
  initDb(databaseUrl);
  await initPlayDl();
  registerVoiceTracker(client);
  startMusicHttpServer(client, musicHttpPort);
  warnDockerBridgeVoice();
  await registerSlashCommands();
  await client.login(token);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
