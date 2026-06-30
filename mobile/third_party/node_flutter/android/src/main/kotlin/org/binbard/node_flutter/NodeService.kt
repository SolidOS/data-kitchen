package org.binbard.node_flutter

import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.system.ErrnoException
import android.system.Os
import android.util.Log
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.embedding.engine.plugins.activity.ActivityAware
import io.flutter.embedding.engine.plugins.activity.ActivityPluginBinding
import io.flutter.embedding.engine.plugins.lifecycle.HiddenLifecycleReference
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.MethodChannel.MethodCallHandler
import io.flutter.plugin.common.MethodChannel.Result
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import java.io.*
import java.util.*
import java.util.concurrent.Semaphore

import android.app.*
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class NodeService : Service() {
    private lateinit var mainFileName: String
    private lateinit var nodeJsProjectPath: String
    private lateinit var builtinModulesPath: String

    private var startedNodeAlready = false

    companion object {
        // Load the native libraries
        init {
            System.loadLibrary("nodejs-mobile-flutter-native-lib")
            System.loadLibrary("node")
        }
    }

    override fun onCreate() {
        super.onCreate()
    }

    private fun startForegroundService(title: String = "Node Service", content: String = "Running") {
        startedNodeAlready = false

        val channelId = "NodeServiceChannel"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Service Channel",
                NotificationManager.IMPORTANCE_LOW
            )
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle(title)
            .setContentText(content)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .build()

        startForeground(1, notification)

        Log.d("NodeService", "Foreground service started with title: $title, content: $content")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.getStringExtra("action") ?: "start"
        val title = intent?.getStringExtra("title") ?: "Node Service"
        val content = intent?.getStringExtra("content") ?: "Running"
        val redirectOutputToLogcat = intent?.getBooleanExtra("redirectOutputToLogcat", true) ?: true

        Log.d("NodeService", "onStartCommand: action=$action, title=$title, content=$content")

        if (action == "stop") {
            stopForeground(true)
            stopSelf()
            return START_NOT_STICKY
        }

        mainFileName = intent?.getStringExtra("mainFileName") ?: ""
        nodeJsProjectPath = intent?.getStringExtra("nodeJsProjectPath") ?: ""
        builtinModulesPath = intent?.getStringExtra("builtinModulesPath") ?: ""

        startForegroundService(title, content)

        try {
            Log.d("NodeService", "Starting Node.js from NodeService")
            startNodeServer(mainFileName, redirectOutputToLogcat);
        } catch (e: ErrnoException) {
            Log.e("NodeService", "Error starting Node.js: ${e.message}")
        } catch (e: Exception) {
            Log.e("NodeService", "Unexpected error: ${e.message}")
        }

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startNodeServer(mainFileName: String, redirectOutputToLogcat: Boolean) {
        // Make sure we only have one instance of Node running
        if (!startedNodeAlready) {
            startedNodeAlready = true

            Thread {
                val exitCode = NodeFlutterPlugin.startNode(arrayOf("node", "$nodeJsProjectPath/$mainFileName"),
                    "$nodeJsProjectPath:$builtinModulesPath",
                    redirectOutputToLogcat
                )
                
                // Report back the exit code on the main thread
                android.os.Handler(android.os.Looper.getMainLooper()).post {
                    if (exitCode != 0) {
                        Log.e("NodeService", "Node.js exited with code $exitCode")
                    } else {
                        Log.i("NodeService", "Node.js exited successfully")
                    }
                }
            }.start()
        } else {
            Log.d("NodeService", "Node is already running")
        }
    }
}

external fun startNodeWithArguments(arguments: Array<String>, modulesPath: String, redirectOutputToLogcat: Boolean): Int