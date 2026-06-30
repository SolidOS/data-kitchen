const { EventEmitter } = require('events');
const NativeBridge = process._linkedBinding('flutter_bridge');

const EVENT_CHANNEL = '_EVENTS_';

class FlutterBridge extends EventEmitter {
  constructor() {
    super();
    this.registeredChannels = new Set();
  }

  /**
   * Register a channel to receive messages from Flutter
   * @param {string} channelName 
   * @param {(msg: string) => void} callback 
   */
  register(channelName, callback) {
    if (this.registeredChannels.has(channelName)) {
      return; // Already registered
    }

    NativeBridge.registerChannel(channelName, (_, data) => {
      try {
        // Attempt to parse JSON messages automatically
        const parsed = this._tryParseJson(data);
        if (callback) callback(parsed);

        const tag = parsed.tag;
        const message = parsed.message;
        this.emit(tag, message);

        if (tag !== EVENT_CHANNEL) {
          this.emit(EVENT_CHANNEL, parsed);
        }
      } catch (err) {
        this.emit('error', err);
      }
    });

    this.registeredChannels.add(channelName);
  }

  /**
   * Send a message to Flutter
   * @param {string} channelName 
   * @param {string|object} message 
   */
  send(channelName, message) {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    NativeBridge.sendMessage(channelName, payload);
  }

  /**
   * Get the data directory path
   * @return {string} Data directory path
   */
  getDataDir() {
    return NativeBridge.getDataDir();
  }

  _tryParseJson(msg) {
    try {
      return JSON.parse(msg);
    } catch {
      return msg; // Return raw string if not JSON
    }
  }
}


const bridge = new FlutterBridge();

bridge.register(EVENT_CHANNEL);
bridge.register = undefined;

module.exports = bridge;

