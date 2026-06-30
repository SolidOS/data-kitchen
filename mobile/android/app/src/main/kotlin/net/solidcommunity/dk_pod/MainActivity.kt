package net.solidcommunity.dk_pod

import io.flutter.embedding.android.FlutterActivity

// NOTE: an earlier version called ConnectivityManager.bindProcessToNetwork() to
// try to fix nodejs-mobile's broken outbound networking. It did NOT fix outbound
// (node's sockets still hang) and it BROKE loopback (127.0.0.1) from the main app
// process — so the Dart readiness poll couldn't reach the in-app servers. Removed.
// The outbound fix (task: proxy + remote auth) needs a different approach
// (bridge through Android's HTTP stack), not a process-wide network bind.
class MainActivity : FlutterActivity()
