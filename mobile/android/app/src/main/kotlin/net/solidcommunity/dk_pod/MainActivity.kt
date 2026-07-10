package net.solidcommunity.dk_pod

import android.view.KeyEvent
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

// NOTE: an earlier version called ConnectivityManager.bindProcessToNetwork() to
// try to fix nodejs-mobile's broken outbound networking. It did NOT fix outbound
// (node's sockets still hang) and it BROKE loopback (127.0.0.1) from the main app
// process — so the Dart readiness poll couldn't reach the in-app servers. Removed.
// The outbound fix (task: proxy + remote auth) needs a different approach
// (bridge through Android's HTTP stack), not a process-wide network bind.
class MainActivity : FlutterActivity() {
    // Whether the Dart side has a reader/login overlay showing. Kept as a
    // local flag (set synchronously over the channel) so dispatchKeyEvent can
    // decide without an async round-trip.
    private var overlayOpen = false
    private var backChannel: MethodChannel? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        backChannel = MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger, "dk/back"
        ).also { ch ->
            ch.setMethodCallHandler { call, result ->
                when (call.method) {
                    "setOverlayOpen" -> { overlayOpen = call.arguments == true; result.success(null) }
                    else -> result.notImplemented()
                }
            }
        }
    }

    // The overlay WebView is a native platform view that swallows KEYCODE_BACK
    // before Flutter's pop system (PopScope) ever sees it — measured on the
    // S23: back backgrounds the app when no overlay is up, but does nothing at
    // all with the overlay open. Intercept at the activity (dispatchKeyEvent
    // runs before the focused view) and let Dart close the overlay.
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (overlayOpen && event.keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.action == KeyEvent.ACTION_UP) backChannel?.invokeMethod("closeOverlay", null)
            return true
        }
        return super.dispatchKeyEvent(event)
    }
}
