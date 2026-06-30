import 'dart:async';
import 'dart:io';

// Loopback CONNECT forward proxy.
//
// nodejs-mobile's own outbound sockets don't route on this (multi-network)
// Android device — c-ares DNS and raw TCP both hang. Dart's dart:io sockets DO
// route (same Android network stack the WebView and the ANU solidpod Flutter
// apps use). So node tunnels every external connection through here: it sends
// `CONNECT host:port`, we open a Dart Socket to the target (Android net resolves
// DNS + routes), reply `200`, then pipe bytes both ways. Loopback/private hosts
// are handled node-side (connect-agent.js) and never reach this proxy.
class ForwardProxy {
  static const int port = 8011;
  static ServerSocket? _server;

  static Future<void> start() async {
    if (_server != null) return;
    await _selfTest();
    _server = await ServerSocket.bind(InternetAddress.loopbackIPv4, port);
    _log('forward proxy listening 127.0.0.1:$port');
    _server!.listen(_handleClient, onError: (e) => _log('accept error: $e'));
  }

  // Gating check: can Dart reach the internet on this device/network at all?
  static Future<void> _selfTest() async {
    try {
      final s = await Socket.connect('example.com', 443,
          timeout: const Duration(seconds: 8));
      s.destroy();
      _log('self-test OK — Dart reached example.com:443');
    } catch (e) {
      _log('self-test FAILED — Dart cannot reach external ($e); outbound will not work');
    }
  }

  static void _handleClient(Socket client) {
    final header = <int>[];
    var tunneling = false;
    Socket? upstream;
    late StreamSubscription<List<int>> sub;

    sub = client.listen(
      (data) async {
        if (tunneling) {
          try {
            upstream!.add(data);
          } catch (_) {}
          return;
        }
        header.addAll(data);
        final end = _indexOfDoubleCrlf(header);
        if (end < 0) {
          if (header.length > 16384) client.destroy(); // runaway header
          return;
        }
        final firstLine =
            String.fromCharCodes(header.sublist(0, end)).split('\r\n').first;
        final parts = firstLine.split(' ');
        if (parts.length < 2 || parts[0].toUpperCase() != 'CONNECT') {
          _writeAndClose(client, 'HTTP/1.1 405 Method Not Allowed\r\n\r\n');
          return;
        }
        final hostPort = parts[1];
        final ci = hostPort.lastIndexOf(':');
        final host = ci > 0 ? hostPort.substring(0, ci) : hostPort;
        final tport =
            ci > 0 ? (int.tryParse(hostPort.substring(ci + 1)) ?? 443) : 443;

        sub.pause();
        try {
          upstream = await Socket.connect(host, tport,
              timeout: const Duration(seconds: 15));
        } catch (e) {
          _writeAndClose(client, 'HTTP/1.1 502 Bad Gateway\r\n\r\n');
          return;
        }
        tunneling = true;
        try {
          client.add('HTTP/1.1 200 Connection Established\r\n\r\n'.codeUnits);
        } catch (_) {}
        // Any bytes after the CONNECT header (rare) belong to the tunnel.
        if (header.length > end + 4) {
          try {
            upstream!.add(header.sublist(end + 4));
          } catch (_) {}
        }
        // upstream -> client
        upstream!.listen(
          (d) {
            try {
              client.add(d);
            } catch (_) {}
          },
          onDone: () => _destroy(client),
          onError: (_) => _destroy(client),
          cancelOnError: true,
        );
        sub.resume();
      },
      onError: (_) {
        _destroy(client);
        _destroy(upstream);
      },
      onDone: () => _destroy(upstream),
      cancelOnError: true,
    );
  }

  static void _writeAndClose(Socket s, String msg) {
    try {
      s.add(msg.codeUnits);
    } catch (_) {}
    _destroy(s);
  }

  static void _destroy(Socket? s) {
    try {
      s?.destroy();
    } catch (_) {}
  }

  static int _indexOfDoubleCrlf(List<int> b) {
    for (var i = 0; i + 3 < b.length; i++) {
      if (b[i] == 13 && b[i + 1] == 10 && b[i + 2] == 13 && b[i + 3] == 10) {
        return i;
      }
    }
    return -1;
  }

  static void _log(String m) => print('[dk-proxy] $m');
}
