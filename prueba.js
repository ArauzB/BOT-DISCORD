const { Client, Intents } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { createAudioPlayer, createAudioResource, joinVoiceChannel } = require('@discordjs/voice');
const { YTSearcher } = require('ytsearcher');
const ytdl = require('ytdl-core');

const bot = new Client({ intents: 3276799 });
const guildId = ''; // Reemplaza con el ID de tu servidor
const myToken = ''; // Reemplaza con tu token

const queue = new Map();
const voiceConnections = new Map();
const searcher = new YTSearcher('');
const commands = [
    {
      name: 'play',
      description: 'Reproduce una canción en el canal de voz actual.',
      options: [
        {
          name: 'song',
          description: 'Nombre de la canción o URL de YouTube',
          type: 3,
          required: true
        }
      ]
    },
    {
      name: 'skip',
      description: 'Omite la canción actual y reproduce la siguiente en la cola.'
    },
    {
      name: 'stop',
      description: 'Detiene la reproducción actual y limpia la cola de reproducción.'
    },
    {
      name: 'help',
      description: 'Muestra la lista de comandos disponibles y sus descripciones.'
    }
  ];
  
  const rest = new REST({ version: '9' }).setToken(myToken);
  
  bot.once('ready', async () => {
    try {
      console.log('Empezando a registrar comandos...');
  
      await rest.put(
        Routes.applicationGuildCommands(bot.user.id, guildId),
        { body: commands },
      );
  
      console.log('Comandos registrados correctamente!');
    } catch (error) {
      console.error('Error al registrar comandos:', error);
    }
  });
  
  bot.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;
  
    const { commandName, options } = interaction;
  
    if (commandName === 'play') {
      const song = options.getString('song');
      const voiceChannel = interaction.member.voice.channel;
  
      if (!voiceChannel) {
        return interaction.reply('No estás en un canal de voz.');
      }
  
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: interaction.guildId,
        adapterCreator: interaction.guild.voiceAdapterCreator
      });
  
      voiceConnections.set(interaction.guildId, connection);
  
      let songUrl = song;
      let songTitle = "";
  
      try {
        if (!ytdl.validateURL(songUrl)) {
          const query = song;
          const searchResult = await searcher.search(query);
          if (!searchResult || !searchResult.first) {
            return interaction.reply(`No se encontraron resultados para "${query}".`);
          }
          songUrl = searchResult.first.url;
          songTitle = searchResult.first.title;
        } else {
          const songInfo = await ytdl.getInfo(songUrl);
          songTitle = songInfo.videoDetails.title;
        }
  
        const songData = { url: songUrl, title: songTitle };
  
        if (!queue.has(interaction.guildId)) {
          queue.set(interaction.guildId, [songData]);
          playNextSong(interaction.guildId, interaction);
          await interaction.reply(`Reproduciendo "${songTitle}"`);
        } else {
          queue.get(interaction.guildId).push(songData);
          await interaction.reply(`Se añadió "${songTitle}" a la cola. Canciones en cola: ${queue.get(interaction.guildId).length}`);
        }
      } catch (error) {
        console.error("Error al procesar la canción:", error);
        await interaction.reply("Ocurrió un error al procesar la canción.");
      }
    } else if (commandName === 'skip') {
      const voiceChannel = interaction.member.voice.channel;
  
      if (!voiceChannel) {
        return interaction.reply('No estás en un canal de voz.');
      }
  
      const serverQueue = queue.get(interaction.guildId);
      if (!serverQueue || serverQueue.length === 0) {
        return interaction.reply('No hay canciones en la cola para saltar.');
      }
  
      serverQueue.shift();
      playNextSong(interaction.guildId, interaction);
      await interaction.reply('Saltando canción actual.');
    } else if (commandName === 'stop') {
      const voiceChannel = interaction.member.voice.channel;
  
      if (!voiceChannel) {
        return interaction.reply('No estás en un canal de voz.');
      }
  
      const serverQueue = queue.get(interaction.guildId);
      if (!serverQueue || serverQueue.length === 0) {
        return interaction.reply('No estoy reproduciendo nada.');
      }
  
      queue.get(interaction.guildId).length = 0;
      await interaction.reply('¡Detenido y limpiado la cola!');
      const connection = voiceConnections.get(interaction.guildId);
      if (connection) {
        resetQueue(interaction.guildId);
      }
    } else if (commandName === 'help') {
      let response = '**Lista de Comandos:**\n';
      for (const cmd of commands) {
        response += `**/${cmd.name}**: ${cmd.description}\n`;
      }
      await interaction.reply(response);
    }
  });
  
  async function playNextSong(guildId, interaction) {
    const connection = voiceConnections.get(guildId);
    if (!connection) {
      console.log("No estoy conectado a un canal de voz.");
      return;
    }
  
    const serverQueue = queue.get(guildId);
    if (!serverQueue || serverQueue.length === 0) {
      console.log("No hay más canciones en la cola.");
      await resetQueue(guildId);
      return;
    }
  
    const song = serverQueue[0];
    const streamOptions = {
      quality: 'highestaudio',
      filter: 'audioonly',
      highWaterMark: 1 << 25
    };
  
    const stream = ytdl(song.url, streamOptions);
    const resource = createAudioResource(stream);
    const player = createAudioPlayer();
  
    player.on('stateChange', async (oldState, newState) => {
      if (newState.status === 'idle') {
        try {
          if (!interaction.deferred && !interaction.replied) {
            await interaction.reply(`¡Terminó la reproducción de: ${song.title}`);
          }
          serverQueue.shift();
  
          if (serverQueue.length > 0) {
            await playNextSong(guildId, interaction);
          } else {
            await interaction.reply("No hay más canciones en la cola.");
            resetQueue(guildId);
          }
        } catch (error) {
          console.error("Error al responder a la interacción:", error);
        }
      }
    });
  
    connection.subscribe(player);
    player.play(resource);
  }
  
  async function resetQueue(guildId) {
    const connection = voiceConnections.get(guildId);
    if (connection) {
      connection.destroy();
      voiceConnections.delete(guildId);
    }
    queue.delete(guildId);
  }
  
  bot.login(myToken);