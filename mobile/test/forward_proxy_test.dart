// Integration tests for lib/forward_proxy.dart — the Dart loopback CONNECT
// proxy that node tunnels its outbound traffic through (Dart sockets route on
// Android where nodejs-mobile's don't).
//
// These are pure dart:io tests (no Flutter binding): we bind a local "target"
// server, start the ForwardProxy, then act as node — open a CONNECT tunnel and
// verify bytes flow both ways, plus the error paths (405 / 502).
//
// Note: ForwardProxy.start() runs a one-time self-test that dials example.com:443.
// It's wrapped in try/catch, so it's non-fatal offline — the proxy still binds.
// (Offline, that self-test costs its ~8s timeout once before the suite proceeds.)

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:dk_pod/forward_proxy.dart';

void main() {
  late ServerSocket target;
  late int targetPort;

  setUpAll(() async {
    // Target server: greets every connection, then echoes whatever it receives
    // (uppercased) so we can prove the tunnel carries payload both directions.
    target = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
    targetPort = target.port;
    target.listen((sock) {
      sock.write('HELLO\n');
      sock.listen((data) {
        sock.add(utf8.encode(utf8.decode(data).toUpperCase()));
      }, onError: (_) {}, cancelOnError: true);
    });

    await ForwardProxy.start();
  });

  tearDownAll(() async {
    await target.close();
  });

  // Connect to the proxy and read its full response to a CONNECT header.
  Future<({String status, Socket sock})> openTunnel(String hostPort) async {
    final sock = await Socket.connect(InternetAddress.loopbackIPv4, ForwardProxy.port);
    sock.add(utf8.encode('CONNECT $hostPort HTTP/1.1\r\nHost: $hostPort\r\n\r\n'));
    // Read just the proxy's status line/headers (up to the blank line).
    final completer = Completer<String>();
    final buf = <int>[];
    late StreamSubscription sub;
    sub = sock.listen((data) {
      buf.addAll(data);
      final s = utf8.decode(buf, allowMalformed: true);
      final i = s.indexOf('\r\n\r\n');
      if (i >= 0 && !completer.isCompleted) {
        sub.pause();
        completer.complete(s.substring(0, i));
      }
    });
    final header = await completer.future.timeout(const Duration(seconds: 5));
    // Hand the live socket (with subscription paused) back for tunnel tests.
    return (status: header.split('\r\n').first, sock: sock);
  }

  test('establishes a tunnel and pipes bytes both ways', () async {
    final sock = await Socket.connect(InternetAddress.loopbackIPv4, ForwardProxy.port);
    final lines = <String>[];
    final firstHello = Completer<void>();
    final got = Completer<void>();
    sock.listen((data) {
      lines.add(utf8.decode(data, allowMalformed: true));
      final joined = lines.join();
      if (joined.contains('HELLO') && !firstHello.isCompleted) firstHello.complete();
      if (joined.contains('PING!') && !got.isCompleted) got.complete();
    });

    sock.add(utf8.encode('CONNECT 127.0.0.1:$targetPort HTTP/1.1\r\n\r\n'));
    await firstHello.future.timeout(const Duration(seconds: 5));

    final joined = lines.join();
    expect(joined, contains('200 Connection Established'));
    expect(joined, contains('HELLO'), reason: 'target greeting flowed back through the tunnel');

    // Send a payload; the echo target uppercases it and returns it.
    sock.add(utf8.encode('ping!'));
    await got.future.timeout(const Duration(seconds: 5));
    expect(lines.join(), contains('PING!'));

    await sock.close();
  });

  test('rejects a non-CONNECT request with 405', () async {
    final sock = await Socket.connect(InternetAddress.loopbackIPv4, ForwardProxy.port);
    final done = Completer<String>();
    final buf = <int>[];
    sock.listen((d) {
      buf.addAll(d);
      if (!done.isCompleted) done.complete(utf8.decode(buf, allowMalformed: true));
    }, onDone: () { if (!done.isCompleted) done.complete(utf8.decode(buf, allowMalformed: true)); });
    sock.add(utf8.encode('GET / HTTP/1.1\r\nHost: x\r\n\r\n'));
    final resp = await done.future.timeout(const Duration(seconds: 5));
    expect(resp, contains('405'));
    await sock.close();
  });

  test('returns 502 when the upstream target is unreachable', () async {
    // Port 1 on loopback refuses → the proxy can't open the upstream socket.
    final r = await openTunnel('127.0.0.1:1');
    expect(r.status, contains('502'));
    await r.sock.close();
  });

  test('listens on the documented loopback port (8011)', () {
    expect(ForwardProxy.port, 8011);
  });
}
