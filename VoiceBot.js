const Discord = require('discord.js');
const { Client, Intents, MessageEmbed,VoiceState  } = require('discord.js');
const { createAudioPlayer, createAudioResource, joinVoiceChannel,   } = require('@discordjs/voice');
const { Readable } = require('stream');
const speech = require('@google-cloud/speech');

const client = new Client({ intents: 3276799 });
const speechClient = new speech.SpeechClient();

const PREFIX = "!";// Prefijo para comandos del bot
const triggerWord = 'bot'; // Palabra que activa el reconocimiento de voz
const listeningTime = 5; // Tiempo en segundos para escuchar después del triggerWord

let listening = false;

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
    // Verificar que el mensaje provenga de un canal de texto y no del bot mismo
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const commandBody = message.content.slice(PREFIX.length);
    const args = commandBody.split(" ");
    const command = args.shift().toLowerCase();

    if (command === 'listen') {
        // Comando para activar el escucha de voz
        if (listening) {
            message.channel.send('Ya estoy escuchando.');
            return;
        }

        // Iniciar escucha de voz después de la palabra trigger
        listening = true;
        message.channel.send('Escuchando... Dime algo después de "bot".');

        try {
            const voiceChannel = message.member.voice.channel;
            if (!voiceChannel) {
                message.channel.send('Debes estar en un canal de voz para usar este comando.');
                listening = false;
                return;
            }

            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator,
            });

            const receiver = connection.receiver;

            receiver.speaking.on('start', (userId) => {
                if (userId === message.author.id) {
                    const audioStream = receiver.subscribe(userId, { mode: 'pcm' });

                    const requestConfig = {
                        config: {
                            encoding: 'LINEAR16',
                            sampleRateHertz: 16000,
                            languageCode: 'es-ES', // Configura el idioma según tu preferencia
                        },
                        interimResults: false,
                    };

                    const recognizeStream = speechClient
                        .streamingRecognize(requestConfig)
                        .on('error', console.error)
                        .on('data', (data) => {
                            const transcription = data.results
                                .map((result) => result.alternatives[0].transcript)
                                .join('\n');

                            // Filtrar la transcripción para capturar solo lo dicho después del triggerWord
                            const startIndex = transcription.toLowerCase().indexOf(triggerWord) + triggerWord.length;
                            const spokenText = transcription.substring(startIndex).trim();

                            message.channel.send(`Texto detectado: "${spokenText}"`);
                            listening = false; // Terminar la escucha después de una transcripción
                        });

                    // Pipe audio stream al servicio de reconocimiento de voz
                    const readableStream = new Readable({
                        read() {
                            this.push(audioStream.read());
                        },
                    });

                    readableStream.pipe(recognizeStream);

                    // Detener la escucha después de cierto tiempo
                    setTimeout(() => {
                        readableStream.destroy();
                        connection.disconnect();
                        listening = false;
                    }, listeningTime * 1000);
                }
            });
        } catch (error) {
            console.error('Error al unirse al canal de voz:', error);
            message.channel.send('Error al unirse al canal de voz.');
            listening = false;
        }
    }
});

// Autenticar el bot con tu token de Discord
client.login('');
