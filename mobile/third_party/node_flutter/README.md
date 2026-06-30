# 🧠 node_flutter

Run a full **Node.js** runtime **inside Flutter** — with background service support and a powerful communication bridge between Dart and Node.js.

> Inspired by [nodejs-mobile](https://code.janeasystems.com/nodejs-mobile/getting-started-react-native), this plugin allows Flutter apps to run native Node.js scripts and exchange messages efficiently using tagged messages.

---

## ✨ Features

- ✅ Run full Node.js scripts inside your Flutter app (even in background)
- ✅ Communicate from Flutter to Node.js and vice versa
- ✅ Foreground service support — your server never dies!
- ✅ Structured messaging with tags
- ✅ Native Dart API and Node.js wrapper

---

## 🚀 Quick Start

### 🛠️ 1. Create Node.js entry file

Create this folder structure in your Flutter project:

```
android/app/src/main/assets/nodejs-project/
  └── main.js
```

**main.js** example:

```js
const bridge = require('./bridge');

bridge.on('hello', (msg) => {
  console.log("Flutter says:", msg);
  bridge.send('hello', 'Hello back from Node.js!');
});
```

> You can create a `bridge.js` file with the code shown in the [📦 Node.js API](#-nodejs-api) section below.

---

### 🐦 2. Register assets in `pubspec.yaml`

```yaml
flutter:
  assets:
    - nodejs-project/
```

---

### 📲 3. Flutter `main.dart` example

```dart
import 'package:flutter/material.dart';
import 'package:node_flutter/node_flutter.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Nodejs.start(); // Start Node.js with main.js
  Nodejs.sendMessage("hello", "Hello from Flutter");

  Nodejs.onMessageReceived.listen((event) {
    if (event['channelName'] == 'hello') {
      print("Node says: ${event['message']}");
    }
  });

  runApp(MyApp());
}
```

---

## 🔁 Communication Model

Messages between Flutter and Node.js are sent as tagged string payloads, like:

When sent from Flutter to Node.js
```json
msg { "tag": "chat", "message": "Hello world" }
```

When sent from Node.js to Flutter
```json
msg { "channelName": "chat", "message": "Hello world" }
```

You can send plain strings or JSON objects (automatically parsed).

---
---

## 📦 Node.js API

Create a `main.js` file inside `/path/to/your-project/android/app/src/main/assets/nodejs-project/`:

```js
const bridge = require('flutter-bridge');

console.log("Node.js started");
bridge.send("node", "STARTED");

bridge.on('ping', (message) => {                  // Listen to messages with tag ping sent from Flutter
  console.log(`GOT PING: ${message}`);
  bridge.send("pong", "Hello Flutter!")
});

bridge.on('_EVENTS_', (data) => {                 // This Capture any type of message sent from Flutter
  if (typeof data === 'object' && data !== null) {
    data = JSON.stringify(data);
  }
  console.log(`EVENT: ${data}`);
});
```

---

## 🧩 Flutter API

```dart
await Nodejs.start(); // Starts the Node.js project from main.js
await Nodejs.startWithScript("console.log('Hello world'");

await Nodejs.startService(
  "main.js",
  title: "Node Service",
  content: "Running",
);

await Nodejs.sendMessage("tag", "message");

Nodejs.onMessageReceived.listen((Map<String, dynamic> msg) {
  print("TAG: ${msg['tag']} — Message: ${msg['message']}");
});

final abi = await Nodejs.getCurrentABIName();
final nodePath = await Nodejs.getNodeJsProjectPath();
final version = await Nodejs.getPlatformVersion();
```

---
---

## 🧪 Example Use Cases

- Background file server
- LAN sync service
- Local database syncing (SQLite or JSON files)
- MQTT/WebSocket clients
- Media file indexing

---

## 📁 Folder Structure

```
your_flutter_project/
├── android/app/src/main/assets/nodejs-project/
│   ├── main.js
│   ├── package.json (optional)
│   ├── node_modules (optional)
├── lib/
│   └── main.dart
```

---

## 🔮 Roadmap

- [ ] iOS support
- [x] Persistent Node.js service
- [ ] Auto-restart service on device boot


---

## 📜 License

MIT License

---

## 🔧 Contributing to this project

1. Clone and cd to this project
```
git clone https://github.com/binbard/node_flutter
cd node_flutter
```

2. Extract Download [nodejs-mobile-v.x-android.zip](https://github.com/janeasystems/nodejs-mobile/releases/latest) and ensure this structure:

```
├── /path/to/node_flutter/android/libnode/
│   ├── bin/
│   ├── include/
```

3. Ensure these are configured:

`/path/to/node_flutter/android/app/build.gradle`:
```gradle
android {
    ndkVersion = "27.0.12077973"
}
```

4. Follow flutter commands to get packages, build and run:
```
flutter pub get
flutter run
```

## ❤️ Support & Contributions

If you love this project, star it ⭐ and consider contributing! PRs welcome.