const { Client, Intents, MessageEmbed } = require('discord.js');
const { YTSearcher } = require('ytsearcher');
const ytdl = require("ytdl-core");
const { createAudioPlayer, createAudioResource, joinVoiceChannel,} = require("@discordjs/voice");
const { Activity } = require("discord-activity");
const Discord = require('discord.js');
const mySecret = process.env["DISCORD_TOKEN"];

const bot = new Client({ intents: 3276799 });
const PREFIX = "!";
const queue = new Map();

// Array para almacenar las canciones en la cola
const voiceConnections = new Map();
const searcher = new YTSearcher('');
const commands = {
  play: {
    description: 'Reproduce una canción en el canal de voz actual. Uso: !play <nombre de la canción o URL de YouTube>',
  },
  skip: {
    description: 'Omite la canción actual y reproduce la siguiente en la cola.',
  },
  stop: {
    description: 'Detiene la reproducción actual y limpia la cola de reproducción.',
  },
  help: {
    description: 'Muestra la lista de comandos disponibles y sus descripciones.',
  },
};


bot.on("ready", () => {
  console.log(`Logged in as ${bot.user.tag}!`);
  const activity = new Activity({
    type: "PLAYING", 
    name: "THE GAME", 
  }); 

  bot.user.setActivity(activity);
});

bot.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const commandBody = message.content.slice(PREFIX.length);
  const args = commandBody.split(" ");
  const command = args.shift().toLowerCase();

  const voiceChannel = message.member.voice.channel;

  if (command === "help") {
    let response = "**Lista de Comandos:**\n";
    for (const [cmd, info] of Object.entries(commands)) {
      response += `**${PREFIX}${cmd}**: ${info.description}\n`;
    }
    message.channel.send(response);
  }

  if (command === "play") {
    if (!voiceChannel) {
      return message.reply("No estás en un canal de voz.");
    }

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator,
    });

    voiceConnections.set(message.guild.id, connection);

    let songUrl = args[0];
    let songTitle = "";

   
    if (!ytdl.validateURL(songUrl)) {
      const query = args.join(" ");

      try {
        const searchResult = await searcher.search(query);
        if (!searchResult || !searchResult.first) {
          return message.reply(`No se encontraron resultados para "${query}".`);
        }
        console.log(searchResult);
        songUrl = searchResult.first.url;
        songTitle = searchResult.first.title;

        console.log(songUrl)
      } catch (error) {
        console.error("Error al buscar la canción:", error);
        return message.reply("Ocurrió un error al buscar la canción.");
      }
    } else {
      try {
        const songInfo = await ytdl.getInfo(songUrl);
        songTitle = songInfo.videoDetails.title;
      } catch (error) {
        console.error("Error al obtener información del video:", error);
        return message.reply("Ocurrió un error al obtener información del video.");
      }
    }

    const song = { url: songUrl, title: songTitle };

    if (!queue.has(message.guild.id)) {
      queue.set(message.guild.id, [song]);
      playNextSong(message.guild.id, message);
      message.channel.send(`Reproduciendo "${song.title}" `);
    } else {
      queue.get(message.guild.id).push(song);
      message.channel.send(
        `Se añadió "${song.title}" a la cola. Canciones en cola: ${queue.get(message.guild.id).length}`
      );
    }
  } else if (command === "skip") {
    if (!voiceChannel) {
      return message.reply("No estás en un canal de voz.");
    }

    const serverQueue = queue.get(message.guild.id);
    if (!serverQueue || serverQueue.length === 0) {
      return message.reply("No hay canciones en la cola para saltar.");
    }

    message.channel.send("Saltando la canción actual...");
    serverQueue.shift();
    playNextSong(message.guild.id, message);
  } else if (command === "stop") {
    if (!voiceChannel) {
      return message.reply("No estás en un canal de voz.");
    }

    const serverQueue = queue.get(message.guild.id);
    if (!serverQueue || serverQueue.length === 0) {
      return message.reply("No estoy reproduciendo nada.");
    }

    queue.get(message.guild.id).length = 0;
    message.channel.send("¡Detenido y limpiado la cola!");

    const connection = voiceConnections.get(message.guild.id);
    if (connection) {
      resetQueue(message.guild.id);
    }
  } 
});

async function playNextSong(guildId, message) {
  const connection = voiceConnections.get(guildId);
  if (!connection) {
    message.channel.send("No estoy conectado a un canal de voz.");
    return;
  }

  const serverQueue = queue.get(guildId);
  if (!serverQueue || serverQueue.length === 0) {
    message.channel.send("No hay más canciones en la cola.");
    await resetQueue(guildId);
    return;
  }

  const song = serverQueue[0];
  const streamOptions = {
    quality: "highestaudio",
    filter: "audioonly", 
    highWaterMark: 1 << 25, 
  };

  const stream = ytdl(song.url, streamOptions);
  const resource = createAudioResource(stream);

  const player = createAudioPlayer();

  player.on("stateChange", (oldState, newState) => {
    if (newState.status === "idle") {
    
      message.channel.send("¡Terminó la reproducción de: " + song.title);
      serverQueue.shift(); 

      
      if (serverQueue.length > 0) {
        playNextSong(guildId, message);
      } else {
       
        message.channel.send("No hay más canciones en la cola.");
        resetQueue(guildId);
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

bot.login('');
