{
  description = "Sakti POS development shells";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs {
            inherit system;
            config = {
              allowUnfree = true;
              android_sdk.accept_license = true;
            };
          };
          tauriHostLibraries = with pkgs; [
            atk
            cairo
            gdk-pixbuf
            glib
            gtk3
            libsoup_3
            pango
            webkitgtk_4_1
          ];
          androidPackages = pkgs.androidenv.composeAndroidPackages {
            buildToolsVersions = [
              "35.0.0"
              "36.0.0"
              "36.1.0"
              "37.0.0"
            ];
            platformVersions = [
              "36"
              "36.1"
            ];
            abiVersions = [
              "arm64-v8a"
              "armeabi-v7a"
              "x86"
              "x86_64"
            ];
            includeNDK = true;
            ndkVersion = "26.1.10909125";
            includeEmulator = false;
            includeSystemImages = false;
          };
        in
        {
          default = pkgs.mkShell {
            packages =
              with pkgs;
              [
                android-tools
                cargo
                clang
                clippy
                cmake
                gcc
                gnumake
                jdk21
                pkg-config
                protobuf
                psmisc
                rust-analyzer
                rustc
                rustfmt
                sqlite
                stdenv.cc
              ]
              ++ tauriHostLibraries;

            ANDROID_HOME = "${androidPackages.androidsdk}/libexec/android-sdk";
            ANDROID_SDK_ROOT = "${androidPackages.androidsdk}/libexec/android-sdk";
            NDK_HOME = "${androidPackages.androidsdk}/libexec/android-sdk/ndk/26.1.10909125";
            JAVA_HOME = "${pkgs.jdk21.home}";
            LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath tauriHostLibraries;

            shellHook = ''
              export PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
              export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
              export PATH="$HOME/.cargo/bin:$PATH"
              export ANDROID_DEBUG_KEYSTORE="$HOME/.android/debug.keystore"

              mkdir -p "$(dirname "$ANDROID_DEBUG_KEYSTORE")"
              if [ -f "$ANDROID_DEBUG_KEYSTORE" ] && ! keytool -list -v -keystore "$ANDROID_DEBUG_KEYSTORE" -storepass android 2>/dev/null | grep -qi '^Alias name: AndroidDebugKey$'; then
                mv "$ANDROID_DEBUG_KEYSTORE" "$ANDROID_DEBUG_KEYSTORE.bak-$(date +%Y%m%d%H%M%S)"
              fi

              if [ ! -f "$ANDROID_DEBUG_KEYSTORE" ]; then
                keytool -genkey -v \
                  -keystore "$ANDROID_DEBUG_KEYSTORE" \
                  -alias AndroidDebugKey \
                  -keyalg RSA \
                  -keysize 2048 \
                  -validity 10000 \
                  -storepass android \
                  -keypass android \
                  -dname "CN=Android Debug,O=Android,C=US"
              fi

              echo "Sakti POS dev shell."
              echo "Includes host Rust/Bun verification and Android SDK/NDK/JDK."
              echo "Mirrors distrobox as closely as Nix allows:"
              echo "- JDK: distrobox system Java 17, Android Studio JBR 21.0.10; this shell uses JDK 21."
              echo "- Android build-tools: 35.0.0, 36.0.0, 36.1.0, 37.0.0."
              echo "- Android platforms: 36, 36.1."
              echo "- NDK: 26.1.10909125."
              echo "Distrobox remains the primary known-good Android build path."
            '';
          };
        }
      );
    };
}
