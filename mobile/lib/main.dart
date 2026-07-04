import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:node_flutter/node_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'forward_proxy.dart';

// dk-pod Android UI.
//
// Boots the embedded Node runtime (Community Solid Server / pivot on loopback),
// waits for it to answer, then shows the frontend the pod serves in a WebView.
// The frontend is currently SolidOS/mashlib (served by the mobile pivot config
// for Accept: text/html). kFrontendUrl is the single swap point — a future dk
// build would point it at the router (:8000) instead, keeping SolidOS as an
// alternative configuration.
//
// localhost (not 127.0.0.1) so the Host header matches CSS's baseUrl
// (http://localhost:8010/); otherwise CSS 500s "outside the identifier space".

// The router origin (:8000) fronts CSS and merges the dk engine + pod under one
// origin. The dk shell is at /index.html; the mashlib databrowser is at / (and
// any RDF container). Swap kFrontendUrl between them to pick the frontend.
const String kPodOrigin = 'http://localhost:8000';
const String kFrontendUrl = '$kPodOrigin/index.html'; // dk shell (mashlib: '$kPodOrigin/')

// Startup update check (mirrors the desktop electron-config/update-check.cjs).
// kAppVersion is stamped by build-apk.sh (--dart-define=DK_VERSION=<package.json
// version>, the same version that names the release APK); '0.0.0' means a dev
// build (flutter run without the define) — the check is skipped then.
// DK_UPDATE_URL overrides the API base for mock testing.
const String kAppVersion = String.fromEnvironment('DK_VERSION', defaultValue: '0.0.0');
const bool kUpdateCheck = bool.fromEnvironment('DK_UPDATE_CHECK', defaultValue: true);
const String kUpdateUrl = String.fromEnvironment('DK_UPDATE_URL',
    defaultValue: 'https://api.github.com/repos/SolidOS/data-kitchen/releases/latest');

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const DkPodApp());
}

class DkPodApp extends StatelessWidget {
  const DkPodApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Data Kitchen Pod',
      theme: ThemeData(
        colorSchemeSeed: const Color(0xFF3A7A5A),
        brightness: Brightness.dark,
        useMaterial3: true,
      ),
      home: const PodPage(),
    );
  }
}

class PodPage extends StatefulWidget {
  const PodPage({super.key});

  @override
  State<PodPage> createState() => _PodPageState();
}

class _PodPageState extends State<PodPage> {
  final List<String> _log = [];
  bool _ready = false;
  bool _starting = true;
  WebViewController? _web;
  // A dismissible reader overlay for external links (news articles, launch
  // chips). It layers a SECOND WebView over the shell — the shell WebView is
  // never navigated, so its loaded feeds survive (keep-alive), matching the
  // desktop native reader. Null = no overlay.
  WebViewController? _overlay;
  String? _overlayUrl;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  void _append(String line) {
    if (!mounted) return;
    setState(() {
      _log.insert(0, line);
      if (_log.length > 200) _log.removeLast();
    });
  }

  Future<void> _boot() async {
    Nodejs.onMessageReceived.listen((event) {
      _append('[${event['channelName']}] ${event['message']}');
    });

    // Outbound bridge: nodejs-mobile can't reach the internet directly, so it
    // tunnels external connections through this Dart loopback proxy (Dart sockets
    // route correctly on Android). Start it BEFORE Node so it's ready immediately.
    try {
      await ForwardProxy.start();
      _append('outbound proxy ready (127.0.0.1:${ForwardProxy.port})');
    } catch (e) {
      _append('outbound proxy failed: $e');
    }

    // Do NOT await — Nodejs.start()'s Future only resolves when Node exits.
    _append('starting Node runtime…');
    _append('(first run extracts the server — this can take a while)');
    Nodejs.start(fileName: 'main.js');

    for (var attempt = 1; attempt <= 240 && mounted && !_ready; attempt++) {
      await Future.delayed(const Duration(seconds: 1));
      final status = await _probeServer();
      if (status != null) {
        _append('pod server up after ${attempt}s — HTTP $status');
        _openFrontend();
        return;
      }
      if (attempt % 10 == 0) _append('waiting for pod server… (${attempt}s)');
    }
    if (!_ready && mounted) {
      setState(() => _starting = false);
      _append('pod server did not come up — adb logcat | grep dk-pod');
    }
  }

  /// Reachability probe — return the HTTP status if the router answers, else
  /// null. Uses 127.0.0.1 (not 'localhost') to avoid an IPv6 (::1) resolution
  /// that the IPv4-only loopback servers don't answer. Any status counts as up
  /// (a Host-mismatch 500 still means the server is listening); the WebView
  /// then loads kPodOrigin (localhost) so CSS's baseUrl Host check passes.
  Future<String?> _probeServer() async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 2);
    try {
      final req = await client.getUrl(Uri.parse('http://127.0.0.1:8000/'));
      final resp = await req.close();
      await resp.drain();
      return '${resp.statusCode}';
    } catch (_) {
      return null;
    } finally {
      client.close();
    }
  }

  void _openFrontend() {
    final controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFFFFFFFF))
      ..setNavigationDelegate(NavigationDelegate(
        // A top-level navigation to an EXTERNAL host is a news article / launch
        // chip trying to take over the shell (sol-feed's window.open becomes a
        // same-WebView navigation here). Divert it to a dismissible overlay and
        // leave the shell — and its loaded feeds — exactly where they were.
        onNavigationRequest: (req) {
          if (req.isMainFrame && _isExternal(req.url)) {
            _openOverlay(req.url);
            return NavigationDecision.prevent;
          }
          return NavigationDecision.navigate;
        },
        onWebResourceError: (e) => _append('web error: ${e.errorCode} ${e.description}'),
      ))
      ..loadRequest(Uri.parse(kFrontendUrl));
    setState(() {
      _web = controller;
      _ready = true;
      _starting = false;
    });
    _checkForUpdates();   // fire-and-forget; silent unless a newer release exists
  }

  // ── startup update check ──────────────────────────────────────────────────
  // Ask GitHub Releases for the latest version; if newer than this build,
  // offer to open the release APK in the system browser (Android's download +
  // package-installer flow takes over — no silent self-install). An in-place
  // APK upgrade keeps all app data, including the on-device pod, as long as
  // the new APK is signed with the same key (see mobile/README.md).
  //
  // Tag parse requires two dotted parts so the repo's legacy junk tags
  // ("v.04" → bare "04") can't masquerade as a newer version.
  static List<int>? _parseVersion(String tag) {
    final m = RegExp(r'(\d+(?:\.\d+)+)').firstMatch(tag);
    if (m == null) return null;
    return m.group(1)!.split('.').map(int.parse).toList();
  }

  static int _compareVersions(List<int> a, List<int> b) {
    for (var i = 0; i < (a.length > b.length ? a.length : b.length); i++) {
      final d = (i < a.length ? a[i] : 0) - (i < b.length ? b[i] : 0);
      if (d != 0) return d;
    }
    return 0;
  }

  Future<void> _checkForUpdates() async {
    if (!kUpdateCheck || kAppVersion == '0.0.0') return;   // dev build → skip
    final current = _parseVersion(kAppVersion);
    if (current == null) return;
    Map<String, dynamic> release;
    try {
      final client = HttpClient()..connectionTimeout = const Duration(seconds: 10);
      try {
        final req = await client.getUrl(Uri.parse(kUpdateUrl));
        req.headers.set('accept', 'application/json');
        req.headers.set('user-agent', 'data-kitchen/$kAppVersion');
        final resp = await req.close();
        if (resp.statusCode != 200) return;
        release = jsonDecode(await resp.transform(utf8.decoder).join())
            as Map<String, dynamic>;
      } finally {
        client.close();
      }
    } catch (_) {
      return;   // offline / rate-limited — never bother the user
    }
    final latest = _parseVersion('${release['tag_name']}');
    if (latest == null || _compareVersions(latest, current) <= 0) return;
    final assets = (release['assets'] as List?) ?? const [];
    final apk = assets.cast<Map<String, dynamic>?>().firstWhere(
      (a) => (a?['name'] as String? ?? '').endsWith('-android.apk'),
      orElse: () => null,
    );
    if (apk == null || !mounted) return;

    final latestStr = latest.join('.');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Update available'),
        content: Text(
          'Data Kitchen $latestStr is available (you have $kAppVersion).\n\n'
          'Updating replaces only the app itself — your pod and settings '
          'stay on this device and are not touched.\n\n'
          'The new version downloads in your browser; open it when the '
          'download finishes to install.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Later')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Update now')),
        ],
      ),
    );
    if (ok == true) {
      await launchUrl(Uri.parse('${apk['browser_download_url']}'),
          mode: LaunchMode.externalApplication);
    }
  }

  // A URL is "external" (opens in the overlay) when it's http(s) to a host other
  // than the app origin. Same-origin (localhost / 127.0.0.1) and non-http
  // schemes (data:, about:, blob:) load in place.
  bool _isExternal(String url) {
    final u = Uri.tryParse(url);
    if (u == null) return false;
    if (u.scheme != 'http' && u.scheme != 'https') return false;
    return u.host != 'localhost' && u.host != '127.0.0.1';
  }

  void _openOverlay(String url) {
    final c = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFFFFFFFF))
      ..setNavigationDelegate(NavigationDelegate(
        // If the article/login navigates BACK to the app origin (e.g. an OIDC
        // redirect), close the overlay and hand that URL to the shell so login
        // completes there.
        onNavigationRequest: (req) {
          if (req.isMainFrame && !_isExternal(req.url)) {
            _closeOverlay();
            _web?.loadRequest(Uri.parse(req.url));
            return NavigationDecision.prevent;
          }
          return NavigationDecision.navigate;
        },
      ))
      ..loadRequest(Uri.parse(url));
    setState(() {
      _overlay = c;
      _overlayUrl = url;
    });
  }

  void _closeOverlay() {
    if (_overlay == null) return;
    setState(() {
      _overlay = null;
      _overlayUrl = null;
    });
  }

  // The reader overlay: a slim bar (✕ close, host, reload) over a second WebView
  // showing the article. Full-screen on top of the shell; ✕ or Android back
  // dismiss it.
  Widget _buildOverlay(BuildContext context) {
    final host = Uri.tryParse(_overlayUrl ?? '')?.host ?? '';
    return Positioned.fill(
      child: Material(
        color: Colors.white,
        child: SafeArea(
          child: Column(
            children: [
              Container(
                height: 50,
                color: const Color(0xFF1D1F24),
                padding: const EdgeInsets.only(left: 4, right: 8),
                child: Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.close, color: Colors.white),
                      tooltip: 'Close',
                      onPressed: _closeOverlay,
                    ),
                    Expanded(
                      child: Text(host,
                          style: const TextStyle(color: Colors.white, fontSize: 16),
                          overflow: TextOverflow.ellipsis),
                    ),
                    IconButton(
                      icon: const Icon(Icons.refresh, color: Colors.white),
                      tooltip: 'Reload',
                      onPressed: () => _overlay?.reload(),
                    ),
                  ],
                ),
              ),
              Expanded(child: WebViewWidget(controller: _overlay!)),
            ],
          ),
        ),
      ),
    );
  }

  void _showLog() {
    showModalBottomSheet(
      context: context,
      builder: (_) => SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            const Text('Boot log', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            for (final l in _log)
              Text(l, style: const TextStyle(fontFamily: 'monospace', fontSize: 13)),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_ready && _web != null) {
      final overlaid = _overlay != null;
      return PopScope(
        // Android back closes the overlay first (don't exit the app / never
        // touch the shell WebView).
        canPop: !overlaid,
        onPopInvokedWithResult: (didPop, result) { if (!didPop) _closeOverlay(); },
        child: Scaffold(
          appBar: overlaid
              ? null   // the overlay owns the top bar while it's open
              : AppBar(
                  title: const Text('Data Kitchen Pod'),
                  actions: [
                    IconButton(icon: const Icon(Icons.home), tooltip: 'Pod root',
                        onPressed: () => _web!.loadRequest(Uri.parse(kFrontendUrl))),
                    IconButton(icon: const Icon(Icons.refresh), tooltip: 'Reload',
                        onPressed: () => _web!.reload()),
                    IconButton(icon: const Icon(Icons.bug_report), tooltip: 'Boot log',
                        onPressed: _showLog),
                  ],
                ),
          body: Stack(
            children: [
              WebViewWidget(controller: _web!),   // the shell — never navigated away
              if (overlaid) _buildOverlay(context),
            ],
          ),
        ),
      );
    }

    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Data Kitchen Pod')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Card(
              color: scheme.surfaceContainerHighest,
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Row(
                  children: [
                    Icon(_starting ? Icons.hourglass_top : Icons.error_outline,
                        size: 40, color: scheme.outline),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Text(
                        _starting ? 'Starting pod server…' : 'Pod server did not start',
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text('Log', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  color: scheme.surfaceContainerLow,
                  borderRadius: BorderRadius.circular(8),
                ),
                padding: const EdgeInsets.all(8),
                child: ListView.builder(
                  itemCount: _log.length,
                  itemBuilder: (_, i) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Text(_log[i],
                        style: const TextStyle(fontFamily: 'monospace', fontSize: 13)),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
