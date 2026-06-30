// Guards the frontend wiring constants in lib/main.dart.
//
// kFrontendUrl is the README's documented "single swap point" between the dk
// shell (/index.html) and the SolidOS/mashlib databrowser (/). The WebView and
// the in-app router agree on the :8000 origin, and the reachability probe / the
// router origin must stay same-origin with it, so these constants are load-
// bearing — a typo here silently loads the wrong (or no) frontend.
//
// This file deliberately does NOT pumpWidget(DkPodApp): PodPage.initState kicks
// off the real boot pipeline (Nodejs.start + ForwardProxy bind + polling timers),
// which has no place in a host-VM widget test. We assert the wiring instead.

import 'package:flutter_test/flutter_test.dart';

import 'package:dk_pod/main.dart';

void main() {
  test('pod origin is the loopback router port the WebView loads', () {
    expect(kPodOrigin, 'http://localhost:8000');
  });

  test('frontend URL is same-origin with the pod and points at the dk shell', () {
    expect(kFrontendUrl, startsWith(kPodOrigin));
    expect(kFrontendUrl, '$kPodOrigin/index.html');
  });

  test('the app widget constructs', () {
    // Cheap guard that main.dart compiles and the root widget is constructible;
    // building it is covered on-device, not here (see file header).
    expect(const DkPodApp(), isA<DkPodApp>());
  });
}
