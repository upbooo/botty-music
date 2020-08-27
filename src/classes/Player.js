const fs = require('fs-extra');
const ytdl = require('ytdl-core');
const logger = require('@greencoast/logger');
const { channel_id } = require('../configs/settings');
const { PRESENCE_STATUS, ACTIVITY_TYPE } = require('../constants');
const streamEvents = require('../events/stream');
const dispatcherEvents = require('../events/dispatcher');
const queueFilename = './data/queue.txt';
const queue = fs.readFileSync(queueFilename).toString().split('\n').filter((url) => url.startsWith('https://'));

class Player {
  constructor(client) {
    this.client = client;
    this.channel = null;
    this.connection = null;
    this.dispatcher = null;
    this.listeners = 0;
    this.songEntry = 1;
    this.paused = null;
    this.song = null;
  }

  initialize() {
    this.updatePresence();
  }

  updateChannel(channel) {
    logger.info(`Joined ${channel.name} in ${channel.guild.name}.`);
    this.channel = channel;

    if (!this.connection) {
      channel.join()
        .then((connection) => {
          this.connection = connection;
          this.updateListeners();

          if (!this.dispatcher) {
            this.play();
          }
        })
        .catch((error) => {
          logger.error(error);
        });
    }
  }

  updateListeners() {
    this.listeners = this.channel.members.array().length - 1;
  }

  updatePresence(presence = '◼ Nothing to play') {
    this.client.user.setPresence({
      activity: {
        name: presence,
        type: ACTIVITY_TYPE.PLAYING
      },
      status: PRESENCE_STATUS.ONLINE
    })
      .then(() => {
        logger.info(`Presence updated to: ${presence}`);
      })
      .catch((error) => {
        logger.error(error);
      });
  }

  async play() {
    try {
      const stream = await this.createStream()
      this.dispatcher = await this.connection.play(stream);

      this.dispatcher.on(dispatcherEvents.speaking, (speaking) => {
        if (!speaking && !this.paused) {
          this.play();
        }
      });

      this.dispatcher.on(dispatcherEvents.error, (error) => {
        logger.error(error);
        this.play();
      });

      if (process.argv[2] === '--debug') {
        this.dispatcher.on(dispatcherEvents.debug, (info) => {
          logger.debug(info);
        });
      }
    } catch (error) {
      logger.error(error);
      this.play();
    }
  }

  async createStream() {
    const url = queue[this.songEntry];
    return this.createYoutubeStream()
  }

  createYoutubeStream() {
    const stream = ytdl(queue[this.songEntry], {
      quality: 'highestaudio',
      highWaterMark: 1 << 25
    });

    stream.once(streamEvents.info, ({ title }) => {
      this.song = title;
      if (!this.updateDispatcherStatus()) {
        this.updateSongPresence();
      }
    });

    return stream
  }

  updateDispatcherStatus() {
    if (!this.dispatcher) {
      return null;
    }

    if (this.listeners >= 1) {
      return this.createYoutubeStream();
    }

    return this.pauseDispatcher();
  }

  pauseDispatcher() {
    if (this.paused === true) {
      return false;
    }

    this.paused = true;
    this.dispatcher.pause();
    this.updateSongPresence();
    logger.info('Music has been paused because nobody is in my channel.');
    return true;
  }

  updateSongPresence() {
    const icon = this.paused ? '❙ ❙' : '►';
    this.updatePresence(`${icon} ${this.song}`);
  }
}

module.exports = Player;
