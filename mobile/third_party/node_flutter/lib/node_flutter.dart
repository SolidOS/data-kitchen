import 'package:flutter/services.dart';
import 'package:node_flutter/node_flutter_platform_interface.dart';

/// A Flutter interface for starting and communicating with embedded Node.js projects.
class Nodejs {
  /// Starts the Node.js project from a given entry file.
  ///
  /// - [fileName]: The entry point file of the Node.js project, default is `main.js`.
  /// - [redirectOutputToLogcat]: Whether to redirect stdout/stderr to Logcat. Defaults to true.
  ///
  /// Throws an [Exception] if the platform fails to start Node.js.
  static Future<void> start({
    String fileName = "main.js",
    bool redirectOutputToLogcat = true,
  }) async {
    try {
      await NodeFlutterPlatform.instance.startNodeProject(
        fileName,
        redirectOutputToLogcat: redirectOutputToLogcat,
      );
    } on PlatformException catch (e) {
      throw Exception('Failed to start Node.js: ${e.message}');
    }
  }

  /// Starts the Node.js engine by directly running a JavaScript string.
  ///
  /// - [script]: The JavaScript code to be executed.
  /// - [redirectOutputToLogcat]: Whether to redirect stdout/stderr to Logcat. Defaults to true.
  ///
  /// Throws an [Exception] if the script fails to run.
  static Future<void> startWithScript(
    String script, {
    bool redirectOutputToLogcat = true,
  }) async {
    try {
      await NodeFlutterPlatform.instance.startNodeWithScript(
        script,
        redirectOutputToLogcat: redirectOutputToLogcat,
      );
    } on PlatformException catch (e) {
      throw Exception('Failed to start Node.js with script: ${e.message}');
    }
  }

  /// Starts a Node.js script as a background (foreground actually) service with notification support (Android).
  ///
  /// - [script]: JavaScript code to execute.
  /// - [title]: Notification title shown for the service. Defaults to "Node Service".
  /// - [content]: Notification content description. Defaults to "Running".
  /// - [redirectOutputToLogcat]: Whether to redirect output to Logcat. Defaults to true.
  ///
  /// Throws an [Exception] if the service fails to start.
  static Future<void> startService(
    String script, {
    String title = "Node Service",
    String content = "Running",
    bool redirectOutputToLogcat = true,
  }) async {
    try {
      await NodeFlutterPlatform.instance.startNodeService(
        script,
        title,
        content,
      );
    } on PlatformException catch (e) {
      throw Exception('Failed to start Node.js with script: ${e.message}');
    }
  }

  /// Sends a message from Flutter to the Node.js environment.
  ///
  /// - [tag]: A string identifier for routing messages.
  /// - [message]: The message content to send.
  ///
  /// Throws an [Exception] if message sending fails.
  static Future<void> sendMessage(String tag, String message) async {
    try {
      await NodeFlutterPlatform.instance.sendMessage(tag, message);
    } on PlatformException catch (e) {
      throw Exception('Failed to send message: ${e.message}');
    }
  }

  /// A stream of messages received from the Node.js environment.
  ///
  /// Each message is a [Map] with `tag` and `message` keys.
  static Stream<Map<String, dynamic>> get onMessageReceived {
    return NodeFlutterPlatform.instance.onMessageReceived;
  }

  /// Returns the current ABI (Application Binary Interface) name used by the native layer.
  ///
  /// Example: "arm64-v8a", "x86_64".
  static Future<String?> getCurrentABIName() async {
    return await NodeFlutterPlatform.instance.getCurrentABIName();
  }

  /// Returns the file path to the Node.js project directory.
  ///
  /// This path typically contains the main.js and related Node scripts.
  static Future<String?> getNodeJsProjectPath() async {
    return await NodeFlutterPlatform.instance.getNodeJsProjectPath();
  }

  /// Returns the platform version (e.g., Android/iOS version info).
  static Future<String?> getPlatformVersion() async {
    return await NodeFlutterPlatform.instance.getPlatformVersion();
  }
}
