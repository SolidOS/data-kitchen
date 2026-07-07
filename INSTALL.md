# Installing Solid Data Kitchen

Pick your platform below — each section starts with the download link.
Every install is self-contained: the app bundles its own Solid pod server —
no account, sign-up, or separate server needed. Your data (pod contents,
settings, logins) lives outside the app and survives every update.

Download the executable into a folder that you want to be the root of your
local pod. Any existing or new folder. You can change this later if needed.

## Linux

1. Download
   [Solid_Data_Kitchen-<version>-linux.AppImage](https://github.com/SolidOS/data-kitchen/releases/download/v<version>/Solid_Data_Kitchen-<version>-linux.AppImage).
2. Make it executable and run it:

   ```bash
   chmod +x Solid_Data_Kitchen-*.AppImage
   ./Solid_Data_Kitchen-*.AppImage
   ```

   (If your distro lacks FUSE and the AppImage won't start, run it with
   `--appimage-extract-and-run`, or install `libfuse2`.)
3. Updates are automatic: when a newer release exists, the app offers to
   download it, verifies the checksum, swaps the AppImage in place, and
   restarts.

## macOS

1. Download
   [Solid_Data_Kitchen-<version>-mac-x64.zip](https://github.com/SolidOS/data-kitchen/releases/download/v<version>/Solid_Data_Kitchen-<version>-mac-x64.zip),
   unzip it, and drag **Solid Data Kitchen.app** into Applications
   (or run it from anywhere).
2. The app is unsigned, so the first launch needs one extra step:
   **right-click (Control-click) the app → Open → Open**. macOS remembers
   the choice; later launches are normal double-clicks.
3. When a newer release exists, the app downloads it to your Downloads
   folder, verifies it, and shows you where it is — quit and replace the
   app to update.

## Windows

1. Download
   [Solid_Data_Kitchen-<version>-win-x64.zip](https://github.com/SolidOS/data-kitchen/releases/download/v<version>/Solid_Data_Kitchen-<version>-win-x64.zip)
   and unzip it anywhere (a folder in your home directory is fine).
2. Run **Solid Data Kitchen.exe** inside the unzipped folder.
3. The app is unsigned, so SmartScreen may object on first run: click
   **More info → Run anyway**.
4. Updates work like macOS: the app downloads and verifies the new zip,
   then you quit and replace the folder.

## Android

Requires Android 7.0 (API 24) or newer. The APK is distributed here, not
through the Play Store, so it installs by sideload:

1. Download
   [Solid_Data_Kitchen-<version>-android.apk](https://github.com/SolidOS/data-kitchen/releases/download/v<version>/Solid_Data_Kitchen-<version>-android.apk)
   on the phone (or copy it over).
2. Open it. Android will ask you to allow installs from your browser or
   file manager — allow it for this install.
3. Confirm the install prompt (the app is signed with a development key,
   so Play Protect may ask you to confirm you trust the source).
4. When a newer release exists, the app opens the new APK in your browser;
   installing it over the old one keeps all your on-device data.

## First run

The first launch seeds your personal pod and opens the app shell — news
feeds, media players, a pod browser, the SolidOS data browser, and more,
all customizable from the ☰ menu. See the in-app Help (the **?** button)
for a tour.
