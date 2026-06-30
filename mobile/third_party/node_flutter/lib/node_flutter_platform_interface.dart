import 'package:plugin_platform_interface/plugin_platform_interface.dart';
import 'package:node_flutter/node_flutter_method_channel.dart';

/// The platform interface for `node_flutter`.
///
/// This class defines the contract that platform-specific implementations must fulfill.
/// It follows the platform interface pattern using a private token to prevent unauthorized overrides.
abstract class NodeFlutterPlatform extends PlatformInterface {
  /// Constructs a [NodeFlutterPlatform] using a secure token for verification.
  NodeFlutterPlatform() : super(token: _token);

  static final Object _token = Object();

  static NodeFlutterPlatform _instance = MethodChannelNodeFlutter();

  /// The default instance of [NodeFlutterPlatform] to use.
  ///
  /// Defaults to [MethodChannelNodeFlutter], but can be overridden by platform-specific implementations.
  static NodeFlutterPlatform get instance => _instance;

  /// Sets the platform-specific implementation for [NodeFlutterPlatform].
  ///
  /// The [instance] must pass token verification using [PlatformInterface.verifyToken].
  static set instance(NodeFlutterPlatform instance) {
    PlatformInterface.verifyToken(instance, _token);
    _instance = instance;
  }

  /// Starts the embedded Node.js engine with an inline JavaScript [script].
  ///
  /// - [redirectOutputToLogcat]: If true, routes stdout/stderr to Logcat.
  ///
  /// Platform-specific implementations must override this.
  Future<void> startNodeWithScript(
    String script, {
    bool redirectOutputToLogcat = true,
  }) {
    throw UnimplementedError('startNodeWithScript() has not been implemented.');
  }

  /// Starts the Node.js engine by executing the given entry file [mainFileName].
  ///
  /// - [redirectOutputToLogcat]: If true, routes stdout/stderr to Logcat.
  ///
  /// Platform-specific implementations must override this.
  Future<void> startNodeProject(
    String mainFileName, {
    bool redirectOutputToLogcat = true,
  }) {
    throw UnimplementedError('startNodeProject() has not been implemented.');
  }

  /// Starts the Node.js script as a foreground service (e.g. Android Notification Service).
  ///
  /// - [mainFileName]: The Node.js file to execute.
  /// - [title]: Title for the notification.
  /// - [content]: Content text for the notification.
  /// - [redirectOutputToLogcat]: If true, routes stdout/stderr to Logcat.
  ///
  /// Platform-specific implementations must override this.
  Future<void> startNodeService(
    String mainFileName,
    String title,
    String content, {
    bool redirectOutputToLogcat = true,
  }) {
    throw UnimplementedError('startNodeService() has not been implemented.');
  }

  /// Sends a message to the Node.js process with an associated [tag].
  ///
  /// Platform-specific implementations must override this.
  Future<void> sendMessage(String tag, String message) {
    throw UnimplementedError('sendMessage() has not been implemented.');
  }

  /// A stream that listens to messages sent from the Node.js environment.
  ///
  /// Messages are returned as a map containing `tag` and `message` keys.
  Stream<Map<String, dynamic>> get onMessageReceived {
    throw UnimplementedError('onMessageReceived has not been implemented.');
  }

  /// Returns the ABI (Application Binary Interface) name for the current platform.
  ///
  /// Example: `"arm64-v8a"`, `"x86_64"`.
  Future<String?> getCurrentABIName() {
    throw UnimplementedError('getCurrentABIName() has not been implemented.');
  }

  /// Returns the file path where the Node.js project is located.
  ///
  /// This is useful for reading/writing to the same project folder from Dart.
  Future<String?> getNodeJsProjectPath() {
    throw UnimplementedError(
      'getCurrentNodeVersion() has not been implemented.',
    );
  }

  /// Returns the platform version string.
  ///
  /// Example: Android or iOS version string.
  Future<String?> getPlatformVersion() {
    throw UnimplementedError('getPlatformVersion() has not been implemented.');
  }
}
