plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "net.solidcommunity.dk_pod"
    compileSdk = flutter.compileSdkVersion
    // node_flutter's native bridge compiles against the AGP-default NDK (28.x);
    // pin to match the plugin so the build doesn't fail on a version mismatch.
    // The prebuilt nodejs-mobile libnode.so links fine against this NDK.
    ndkVersion = "28.2.13676358"

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    // Ship the bundled node_modules archive (node_modules.nmz) byte-for-byte:
    // AAPT must not (re)compress or decompress it, or node_flutter's asset copy
    // can't open it. untar.cjs reads the gzipped bytes directly.
    androidResources {
        noCompress += "nmz"
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "net.solidcommunity.dk_pod"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = 24
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        // We ship nodejs-mobile libnode.so only for these phone ABIs (no x86_64
        // emulator). Building other ABIs would link against a missing libnode.
        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a")
        }
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
