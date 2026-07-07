import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing: OPT-IN via an untracked android/keystore.properties
// (storeFile / storePassword / keyAlias / keyPassword). Absent the file,
// releases keep signing with the DEBUG key — deliberate for now, because
// the key is forever: existing installs only accept updates signed with
// the SAME key, so switching keys is a one-way decision (Jeff's to make).
val keystoreProps = Properties()
val keystoreFile = rootProject.file("keystore.properties")
if (keystoreFile.exists()) {
    keystoreFile.inputStream().use { s -> keystoreProps.load(s) }
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

    signingConfigs {
        if (keystoreFile.exists()) {
            create("release") {
                storeFile = file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = if (keystoreFile.exists())
                signingConfigs.getByName("release")
            else
                signingConfigs.getByName("debug")
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
