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
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.core.app.ActivityCompat

import java.util.concurrent.TimeUnit
import android.app.*
import android.content.Intent
import android.os.Build
import android.os.IBinder

/** NodeFlutterPlugin */
class NodeFlutterPlugin : FlutterPlugin, MethodCallHandler, ActivityAware, LifecycleEventObserver {
  private lateinit var methodChannel: MethodChannel
  private lateinit var eventChannel: EventChannel
  private var eventSink: EventChannel.EventSink? = null
  private lateinit var context: Context
  private lateinit var activityContext: Context

  private val TAG = "NODEJS-FLUTTER"
  private val NODEJS_PROJECT_DIR = "nodejs-project"
  private val NODEJS_BUILTIN_MODULES = "nodejs-builtin_modules"
  private val TRASH_DIR = "nodejs-project-trash"
  private val SHARED_PREFS = "NODEJS_MOBILE_PREFS"
  private val LAST_UPDATED_TIME = "NODEJS_MOBILE_APK_LastUpdateTime"
  private val BUILTIN_NATIVE_ASSETS_PREFIX = "nodejs-native-assets-"
  private val SYSTEM_CHANNEL = "_SYSTEM_"

  private lateinit var trashDirPath: String
  private lateinit var filesDirPath: String
  private lateinit var nodeJsProjectPath: String
  private lateinit var builtinModulesPath: String
  private lateinit var nativeAssetsPath: String

  private var lastUpdateTime = 1L
  private var previousLastUpdateTime = 0L
  private val initSemaphore = Semaphore(1)
  private var initCompleted = false
  private val NOTIFICATION_PERMISSION_REQUEST_CODE = 1001

  // Flag to indicate if node is ready to receive app events.
  private var nodeIsReadyForAppEvents = false
  
  // We just want one instance of node running in the background.
  private var startedNodeAlready = false

  companion object {
    // Load the native libraries
    init {
      System.loadLibrary("nodejs-mobile-flutter-native-lib")
      System.loadLibrary("node")
    }

    fun startNode(args: Array<String>, modulesPath: String, redirect: Boolean): Int {
        return NodeFlutterPlugin().startNodeWithArguments(args, modulesPath, redirect)
    }
    
    // Static reference to the plugin instance
    private var instance: NodeFlutterPlugin? = null

    @JvmStatic
    fun sendMessageToApplication(channelName: String, msg: String) {
      if (channelName == instance?.SYSTEM_CHANNEL) {
        // If it's a system channel call, handle it in the plugin native side.
        instance?.handleAppChannelMessage(msg)
      } else {
        // Otherwise, send it to Flutter.
        instance?.sendMessageBackToFlutter(channelName, msg)
      }
    }
  }

  override fun onAttachedToEngine(flutterPluginBinding: FlutterPlugin.FlutterPluginBinding) {
    context = flutterPluginBinding.applicationContext
    methodChannel = MethodChannel(flutterPluginBinding.binaryMessenger, "flutter_nodejs_mobile")
    methodChannel.setMethodCallHandler(this)
    
    eventChannel = EventChannel(flutterPluginBinding.binaryMessenger, "_EVENTS_")
    eventChannel.setStreamHandler(object : EventChannel.StreamHandler {
      override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
        eventSink = events
      }

      override fun onCancel(arguments: Any?) {
        eventSink = null
      }
    })
    
    // Store the instance
    instance = this
    
    // Initialize paths and environment
    filesDirPath = context.filesDir.absolutePath
    nodeJsProjectPath = "$filesDirPath/$NODEJS_PROJECT_DIR"
    builtinModulesPath = "$filesDirPath/$NODEJS_BUILTIN_MODULES"
    trashDirPath = "$filesDirPath/$TRASH_DIR"
    nativeAssetsPath = "$BUILTIN_NATIVE_ASSETS_PREFIX${getCurrentABIName()}"
    
    // Sets the TMPDIR environment to the cacheDir, to be used in Node as os.tmpdir
    try {
      Os.setenv("TMPDIR", context.cacheDir.absolutePath, true)
    } catch (e: ErrnoException) {
      e.printStackTrace()
    }
    
    // Register the filesDir as the Node data dir.
    registerNodeDataDirPath(filesDirPath)
    
    asyncInit()
  }

  override fun onMethodCall(call: MethodCall, result: Result) {
    when (call.method) {
      "startNodeWithScript" -> {
        try {
          val script = call.argument<String>("script") ?: ""
          val options = call.argument<Map<String, Any>>("options")

          startNodeWithScript(script, options, result)
        } catch (e: Exception) {
          result.error("NODE_START_FAILED", "Failed to start Node.js runtime", e.toString())
        }
      }
      "startNodeProject" -> {
        try {
          val mainFileName = call.argument<String>("mainFileName") ?: ""
          val options = call.argument<Map<String, Any>>("options")
          
          startNodeProject(mainFileName, options, result)
        } catch (e: Exception) {
          result.error("NODE_START_FAILED", "Failed to start Node.js project", e.toString())
        }
      }
      "startNodeService" -> {
          val mainFileName = call.argument<String>("mainFileName") ?: ""
          val options = call.argument<Map<String, Any>>("options")

          val title = options?.get("title") as? String ?: "Node Service"
          val content = options?.get("content") as? String ?: "Running"
          val redirectOutputToLogcat = extractRedirectOutputToLogcatOption(options)

          val intent = Intent(context, NodeService::class.java).apply {
              putExtra("action", "start")
              putExtra("title", title)
              putExtra("content", content)
              putExtra("redirectOutputToLogcat", redirectOutputToLogcat)

              putExtra("mainFileName", call.argument<String>("mainFileName") ?: "")
              putExtra("nodeJsProjectPath", nodeJsProjectPath)
              putExtra("builtinModulesPath", builtinModulesPath)
          }

          var havePermission = true

          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(
                    context, android.Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED) {

                // Request the permission
                ActivityCompat.requestPermissions(
                    activityContext as Activity,
                    arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),
                    NOTIFICATION_PERMISSION_REQUEST_CODE
                )

                havePermission = false
            }
          }

          if(!havePermission) {
            Log.d(TAG, "Notification permission not granted")
            result.error("NOTIFICATION_PERMISSION_DENIED", "Notification permission not granted", null)
            return
          }

          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
              context.startForegroundService(intent)
          } else {
              context.startService(intent)
          }
          Log.d(TAG, "Node service started")
          result.success("started")
      }
      "stopNodeService" -> {
          val stopIntent = Intent(context, NodeService::class.java)
          stopIntent.putExtra("action", "stop")
          context.startService(stopIntent)
          // context.stopService(stopIntent)
          result.success("stopped")
      }
      "sendMessage" -> {
        val channel = call.argument<String>("channel") ?: ""
        val message = call.argument<String>("message") ?: ""
        sendMessage(channel, message)
        result.success(null)
      }
      "getCurrentABIName" -> {
        val abiName = getCurrentABIName()
        result.success(abiName)
      }
      "getNodeJsProjectPath" -> {
        result.success(nodeJsProjectPath)
      }
      "getPlatformVersion" -> {
        result.success("Android ${android.os.Build.VERSION.RELEASE}")
      }
      else -> {
        result.notImplemented()
      }
    }
  }

  override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
    methodChannel.setMethodCallHandler(null)
    eventChannel.setStreamHandler(null)
    instance = null
  }

  override fun onAttachedToActivity(binding: ActivityPluginBinding) {
    activityContext = binding.activity
    val reference = binding.lifecycle as HiddenLifecycleReference
    reference.lifecycle.addObserver(this)
  }

  override fun onDetachedFromActivityForConfigChanges() {
    // No implementation needed
  }

  override fun onReattachedToActivityForConfigChanges(binding: ActivityPluginBinding) {
    val reference = binding.lifecycle as HiddenLifecycleReference
    reference.lifecycle.addObserver(this)
  }

  override fun onDetachedFromActivity() {
    // No implementation needed
  }

  override fun onStateChanged(source: LifecycleOwner, event: Lifecycle.Event) {
    when (event) {
      Lifecycle.Event.ON_PAUSE -> {
        if (nodeIsReadyForAppEvents) {
          sendMessageToNodeChannel(SYSTEM_CHANNEL, "pause")
        }
      }
      Lifecycle.Event.ON_RESUME -> {
        if (nodeIsReadyForAppEvents) {
          sendMessageToNodeChannel(SYSTEM_CHANNEL, "resume")
        }
      }
      Lifecycle.Event.ON_DESTROY -> {
        // Activity destroyed
      }
      else -> {
        // Ignore other events
      }
    }
  }

  private fun startNodeWithScript(script: String, options: Map<String, Any>?, result: Result) {
    // Make sure we only have one instance of Node running
    if (!startedNodeAlready) {
      startedNodeAlready = true

      val redirectOutputToLogcat = extractRedirectOutputToLogcatOption(options)
      val scriptToRun = script

      Thread {
        waitForInit()
        val exitCode = startNodeWithArguments(
          arrayOf("node", "-e", scriptToRun),
          "$nodeJsProjectPath:$builtinModulesPath",
          redirectOutputToLogcat
        )
        
        // Report back the exit code on the main thread
        android.os.Handler(android.os.Looper.getMainLooper()).post {
          result.success(exitCode)
        }
      }.start()
    } else {
      result.error("NODE_ALREADY_RUNNING", "Node.js runtime is already running", null)
    }
  }

  private fun startNodeProject(mainFileName: String, options: Map<String, Any>?, result: Result) {
    // Make sure we only have one instance of Node running
    if (!startedNodeAlready) {
      startedNodeAlready = true

      val redirectOutputToLogcat = extractRedirectOutputToLogcatOption(options)

      Thread {
        waitForInit()
        val exitCode = startNodeWithArguments(
          arrayOf("node", "$nodeJsProjectPath/$mainFileName"),
          "$nodeJsProjectPath:$builtinModulesPath",
          redirectOutputToLogcat
        )
        
        // Report back the exit code on the main thread
        android.os.Handler(android.os.Looper.getMainLooper()).post {
          result.success(exitCode)
        }
      }.start()
    } else {
      result.error("NODE_ALREADY_RUNNING", "Node.js runtime is already running", null)
    }
  }

  private fun sendMessage(channel: String, msg: String) {
    sendMessageToNodeChannel(channel, msg)
  }

  private fun sendMessageBackToFlutter(channelName: String, msg: String) {
    android.os.Handler(android.os.Looper.getMainLooper()).post {
      val message = mapOf(
        "channelName" to channelName,
        "message" to msg
      )
      eventSink?.success(message)
    }
  }

  private fun handleAppChannelMessage(msg: String) {
    if (msg == "ready-for-app-events") {
      nodeIsReadyForAppEvents = true
    }
  }

  private fun extractRedirectOutputToLogcatOption(options: Map<String, Any>?): Boolean {
    val optionName = "redirectOutputToLogcat"
    return options?.get(optionName) as? Boolean ?: true
  }

  private fun asyncInit() {
    if (wasAPKUpdated()) {
      try {
        initSemaphore.acquire()
        Thread {
          emptyTrash()
          try {
            copyNodeJsAssets()
            initCompleted = true
          } catch (e: IOException) {
            throw RuntimeException("Node assets copy failed", e)
          }
          initSemaphore.release()
          emptyTrash()
        }.start()
      } catch (ie: InterruptedException) {
        initSemaphore.release()
        ie.printStackTrace()
      }
    } else {
      initCompleted = true
    }
  }

  private fun waitForInit() {
    if (!initCompleted) {
      try {
        initSemaphore.acquire()
        initSemaphore.release()
      } catch (ie: InterruptedException) {
        initSemaphore.release()
        ie.printStackTrace()
      }
    }
  }

  private fun wasAPKUpdated(): Boolean {
    val prefs = context.getSharedPreferences(SHARED_PREFS, Context.MODE_PRIVATE)
    previousLastUpdateTime = prefs.getLong(LAST_UPDATED_TIME, 0)

    try {
      val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
      lastUpdateTime = packageInfo.lastUpdateTime
    } catch (e: PackageManager.NameNotFoundException) {
      e.printStackTrace()
    }
    return (lastUpdateTime != previousLastUpdateTime)
  }

  private fun saveLastUpdateTime() {
    val prefs = context.getSharedPreferences(SHARED_PREFS, Context.MODE_PRIVATE)
    val editor = prefs.edit()
    editor.putLong(LAST_UPDATED_TIME, lastUpdateTime)
    editor.apply()
  }

  private fun emptyTrash() {
    val trash = File(trashDirPath)
    if (trash.exists()) {
      deleteFolderRecursively(trash)
    }
  }

  private fun deleteFolderRecursively(file: File): Boolean {
    try {
      var res = true
      if (file.isDirectory) {
        file.listFiles()?.forEach { childFile ->
          if (childFile.isDirectory) {
            res = res and deleteFolderRecursively(childFile)
          } else {
            res = res and childFile.delete()
          }
        }
      }
      res = res and file.delete()
      return res
    } catch (e: Exception) {
      e.printStackTrace()
      return false
    }
  }

  private fun copyNodeJsAssets() {
    val assetManager = context.assets

    // If a previous project folder is present, move it to the trash.
    val nodeDirReference = File(nodeJsProjectPath)
    if (nodeDirReference.exists()) {
      val trash = File(trashDirPath)
      nodeDirReference.renameTo(trash)
    }

    // Load the nodejs project's folder and file lists.
    val dirs = readFileFromAssets(assetManager, "dir.list")
    val files = readFileFromAssets(assetManager, "file.list")

    // Copy the nodejs project files to the application's data path.
    if (dirs.isNotEmpty() && files.isNotEmpty()) {
      Log.d(TAG, "Node assets copy using pre-built lists")
      for (dir in dirs) {
        File("$filesDirPath/$dir").mkdirs()
      }

      for (file in files) {
        val src = file
        val dest = "$filesDirPath/$file"
        copyAsset(assetManager, src, dest)
      }
    } else {
      Log.d(TAG, "Node assets copy enumerating APK assets")
      copyAssetFolder(assetManager, NODEJS_PROJECT_DIR, nodeJsProjectPath)
    }

    copyNativeAssetsFrom(assetManager)

    // Do the builtin-modules copy too.
    // If a previous built-in modules folder is present, delete it.
    val modulesDirReference = File(builtinModulesPath)
    if (modulesDirReference.exists()) {
      deleteFolderRecursively(modulesDirReference)
    }

    // Copy the nodejs built-in modules to the application's data path.
    copyAssetFolder(assetManager, "builtin_modules", builtinModulesPath)

    saveLastUpdateTime()
    Log.d(TAG, "Node assets copy completed successfully")
  }

  private fun copyNativeAssetsFrom(assetManager: android.content.res.AssetManager): Boolean {
    try {
      // Load the additional asset folder and files lists
      val nativeDirs = readFileFromAssets(assetManager, "$nativeAssetsPath/dir.list")
      val nativeFiles = readFileFromAssets(assetManager, "$nativeAssetsPath/file.list")
      
      // Copy additional asset files to project working folder
      if (nativeFiles.isNotEmpty()) {
        Log.v(TAG, "Building folder hierarchy for $nativeAssetsPath")
        for (dir in nativeDirs) {
          File("$nodeJsProjectPath/$dir").mkdirs()
        }
        Log.v(TAG, "Copying assets using file list for $nativeAssetsPath")
        for (file in nativeFiles) {
          val src = "$nativeAssetsPath/$file"
          val dest = "$nodeJsProjectPath/$file"
          copyAsset(assetManager, src, dest)
        }
      } else {
        Log.v(TAG, "No assets to copy from $nativeAssetsPath")
      }
      return true
    } catch (e: Exception) {
      Log.e(TAG, "Error copying native assets: ${e.message}")
      return false
    }
  }

  private fun readFileFromAssets(assetManager: android.content.res.AssetManager, filename: String): ArrayList<String> {
    val lines = ArrayList<String>()
    try {
      val reader = BufferedReader(InputStreamReader(assetManager.open(filename)))
      var line = reader.readLine()
      while (line != null) {
        lines.add(line)
        line = reader.readLine()
      }
      reader.close()
    } catch (e: FileNotFoundException) {
      Log.d(TAG, "File not found: $filename")
    } catch (e: IOException) {
      e.printStackTrace()
    }
    return lines
  }

  private fun copyAssetFolder(assetManager: android.content.res.AssetManager, fromAssetPath: String, toPath: String) {
    try {
      val files = assetManager.list(fromAssetPath)
      
      if (files.isNullOrEmpty()) {
        // If it's a file, it won't have any assets "inside" it.
        copyAsset(assetManager, fromAssetPath, toPath)
      } else {
        File(toPath).mkdirs()
        for (file in files) {
          copyAssetFolder(assetManager, "$fromAssetPath/$file", "$toPath/$file")
        }
      }
    } catch (e: IOException) {
      Log.e(TAG, "Error copying asset folder: $e")
    }
  }

  private fun copyAsset(assetManager: android.content.res.AssetManager, fromAssetPath: String, toPath: String) {
    var input: InputStream? = null
    var output: OutputStream? = null
    
    try {
      input = assetManager.open(fromAssetPath)
      File(toPath).createNewFile()
      output = FileOutputStream(toPath)
      
      val buffer = ByteArray(1024)
      var read: Int
      while (input.read(buffer).also { read = it } != -1) {
        output.write(buffer, 0, read)
      }
    } catch (e: IOException) {
      Log.e(TAG, "Error copying asset: $e")
    } finally {
      try {
        input?.close()
        output?.flush()
        output?.close()
      } catch (e: IOException) {
        e.printStackTrace()
      }
    }
  }

  // Native methods
  external fun registerNodeDataDirPath(dataDir: String)
  external fun getCurrentABIName(): String
  external fun startNodeWithArguments(arguments: Array<String>, modulesPath: String, redirectOutputToLogcat: Boolean): Int
  external fun sendMessageToNodeChannel(channelName: String, msg: String)
}