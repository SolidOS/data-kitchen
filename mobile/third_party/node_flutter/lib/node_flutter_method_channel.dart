import 'dart:async';
import 'dart:convert';
import 'package:flutter/services.dart';
import 'package:node_flutter/node_flutter_platform_interface.dart';
import 'package:logger/logger.dart';

/// The logger instance for logging messages.
final Logger logger = Logger();

/// The MethodChannel implementation of the NodeFlutterPlatform interface.
///
/// This class provides methods to start Node.js with a script or project,
/// send messages, and retrieve platform-specific information.
/// It uses MethodChannel and EventChannel to communicate with the native platform.
class MethodChannelNodeFlutter extends NodeFlutterPlatform {
  final MethodChannel _methodChannel = const MethodChannel(
    'flutter_nodejs_mobile',
  );
  final EventChannel _eventChannel = const EventChannel('_EVENTS_');

  Stream<Map<String, dynamic>>? _onMessageReceived;

  @override
  Future<void> startNodeWithScript(
    String script, {
    bool redirectOutputToLogcat = true,
  }) async {
    await _methodChannel.invokeMethod('startNodeWithScript', {
      'script': script,
      'options': {'redirectOutputToLogcat': redirectOutputToLogcat},
    });
  }

  @override
  Future<void> startNodeProject(
    String mainFileName, {
    bool redirectOutputToLogcat = true,
  }) async {
    await _methodChannel.invokeMethod('startNodeProject', {
      'mainFileName': mainFileName,
      'options': {'redirectOutputToLogcat': redirectOutputToLogcat},
    });
  }

  @override
  Future<void> startNodeService(
    String mainFileName,
    String title,
    String content, {
    bool redirectOutputToLogcat = true,
  }) async {
    await _methodChannel.invokeMethod('startNodeService', {
      'mainFileName': mainFileName,
      'options': {
        'redirectOutputToLogcat': redirectOutputToLogcat,
        'title': title,
        'content': content,
      },
    });
  }

  @override
  Future<void> sendMessage(String tag, String message) async {
    try {
      var data = {'tag': tag, 'message': message};

      await _methodChannel.invokeMethod('sendMessage', {
        'channel': _eventChannel.name,
        'message': jsonEncode(data),
      });
    } on PlatformException catch (e) {
      logger.e('Failed to send message: ${e.message}');
    }
  }

  @override
  Stream<Map<String, dynamic>> get onMessageReceived {
    _onMessageReceived ??= _eventChannel.receiveBroadcastStream().map(
      (event) => Map<String, dynamic>.from(event),
    );
    return _onMessageReceived!;
  }

  @override
  Future<String?> getCurrentABIName() async {
    try {
      final String? abiName = await _methodChannel.invokeMethod(
        'getCurrentABIName',
      );
      return abiName;
    } on PlatformException catch (e) {
      logger.e("Failed to get current ABI name: '${e.message}'.");
      return null;
    }
  }

  @override
  Future<String?> getNodeJsProjectPath() async {
    try {
      final String? projectPath = await _methodChannel.invokeMethod(
        'getNodeJsProjectPath',
      );
      return projectPath;
    } on PlatformException catch (e) {
      logger.e("Failed to get Node.js project path: '${e.message}'.");
      return null;
    }
  }

  @override
  Future<String?> getPlatformVersion() async {
    try {
      final String? version = await _methodChannel.invokeMethod(
        'getPlatformVersion',
      );
      return version;
    } on PlatformException catch (e) {
      logger.e("Failed to get platform version: '${e.message}'.");
      return null;
    }
  }
}
