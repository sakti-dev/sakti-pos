# Native Auth Token Storage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

> Historical note: the reference to `apps/pos-app/src-tauri/src/android/photo_picker.rs` below is from an older architecture snapshot and is no longer part of the current picker flow.

**Goal:** Replace `tauri-plugin-stronghold` with a tiny Android-native encrypted session-token store, migrate existing `localStorage` tokens silently, and reduce Android APK bloat without changing auth UX.

**Architecture:** Add a Tauri mobile plugin named `auth-token` following the existing photo/printer plugin pattern. The Kotlin side encrypts a single bearer token with an Android Keystore AES-GCM key and stores `{ iv, ciphertext }` in `SharedPreferences`; the Rust side exposes stable Tauri commands; the TypeScript `AuthStorage` module uses those commands and only keeps an in-memory cache plus one-time legacy `localStorage` migration.

**Tech Stack:** Tauri v2 mobile plugins, Kotlin Android Keystore (`KeyStore`, `KeyGenerator`, `Cipher` with `AES/GCM/NoPadding`), Rust command bridge, Solid/Vitest TypeScript tests, Cargo tests/checks, Gradle/JUnit tests.

---

## Constraints And Non-Goals

- Do not replace `sqlx`, `reqwest`, or Tokio in this change.
- Keep `[profile.release].opt-level = "s"`.
- Do not use `tauri-plugin-store` for auth tokens.
- Do not add `androidx.security.crypto`; use Android platform Keystore APIs directly.
- Do not keep persistent auth tokens in `localStorage` after migration.
- Treat Android Keystore decrypt failure as logout: clear native token state and return `null`.
- Preserve existing auth callers: `AuthStorage.saveToken`, `AuthStorage.getToken`, and `AuthStorage.clearToken`.
- Keep logs operational and structured; use TypeScript logger for JS logs.

## Current Files To Understand Before Starting

- `apps/pos-app/src/lib/auth/storage.ts` currently uses `@tauri-apps/plugin-stronghold` and mirrors the token to `localStorage`.
- `apps/pos-app/src-tauri/src/lib.rs` registers `tauri_plugin_stronghold::Builder` and uses `rust-argon2` only for Stronghold key derivation.
- `apps/pos-app/src-tauri/src/android/photo_picker.rs` shows the Rust mobile-plugin registration pattern.
- `apps/pos-app/src-tauri/src/hardware/printer.rs` shows the Rust bridge pattern for Android-only plugin commands.
- `apps/pos-app/src-tauri/gen/android/app/src/main/java/com/sakti_dev/sakti_pos/photo/ProductPhotoPlugin.kt` shows Kotlin Tauri plugin command shape.
- `apps/pos-app/src-tauri/capabilities/default.json` grants Stronghold permissions.
- `apps/pos-app/package.json` includes `@tauri-apps/plugin-stronghold`.
- `apps/pos-app/src-tauri/Cargo.toml` includes `tauri-plugin-stronghold` and `rust-argon2`.

---

### Task 1: Add TypeScript Contract Tests For AuthStorage Migration

**Files:**
- Create: `apps/pos-app/src/lib/auth/__test__/storage.test.ts`
- Modify later: `apps/pos-app/src/lib/auth/storage.ts`

**Step 1: Write the failing tests**

Create tests that mock `@tauri-apps/api/core` and verify behavior without touching native code.

```ts
import { beforeEach, describe, expect, test, vi } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const legacyKey = "sakti-pos:session-token";

async function loadStorage() {
  vi.resetModules();
  return await import("../storage");
}

describe("AuthStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
  });

  test("saves token to native storage and keeps an in-memory cache", async () => {
    const { AuthStorage } = await loadStorage();

    await AuthStorage.saveToken("session-1");
    const token = await AuthStorage.getToken();

    expect(invokeMock).toHaveBeenCalledWith("save_auth_token", {
      token: "session-1",
    });
    expect(token).toBe("session-1");
    expect(localStorage.getItem(legacyKey)).toBeNull();
  });

  test("loads token from native storage when memory cache is empty", async () => {
    invokeMock.mockResolvedValueOnce("native-session");
    const { AuthStorage } = await loadStorage();

    await expect(AuthStorage.getToken()).resolves.toBe("native-session");

    expect(invokeMock).toHaveBeenCalledWith("get_auth_token");
  });

  test("migrates legacy localStorage token into native storage once", async () => {
    localStorage.setItem(legacyKey, "legacy-session");
    const { AuthStorage } = await loadStorage();

    await expect(AuthStorage.getToken()).resolves.toBe("legacy-session");

    expect(invokeMock).toHaveBeenCalledWith("save_auth_token", {
      token: "legacy-session",
    });
    expect(localStorage.getItem(legacyKey)).toBeNull();
  });

  test("clears memory, native storage, and legacy localStorage", async () => {
    localStorage.setItem(legacyKey, "legacy-session");
    const { AuthStorage } = await loadStorage();

    await AuthStorage.saveToken("session-1");
    await AuthStorage.clearToken();

    expect(invokeMock).toHaveBeenCalledWith("clear_auth_token");
    expect(localStorage.getItem(legacyKey)).toBeNull();
    invokeMock.mockResolvedValueOnce(null);
    await expect(AuthStorage.getToken()).resolves.toBeNull();
  });

  test("returns null and removes legacy token when native storage fails", async () => {
    invokeMock.mockRejectedValueOnce(new Error("keystore failed"));
    const { AuthStorage } = await loadStorage();

    await expect(AuthStorage.getToken()).resolves.toBeNull();

    expect(localStorage.getItem(legacyKey)).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun test apps/pos-app/src/lib/auth/__test__/storage.test.ts
```

Expected: FAIL because current `storage.ts` imports `@tauri-apps/plugin-stronghold` and calls Stronghold instead of `invoke`.

**Step 3: Stop**

Do not implement yet. Continue with the native bridge tests first so the TypeScript API has a backend contract.

---

### Task 2: Add Rust Bridge Tests For Command Names And Desktop Dev Fallback

**Files:**
- Create: `apps/pos-app/src-tauri/src/auth/mod.rs`
- Modify later: `apps/pos-app/src-tauri/src/lib.rs`

**Step 1: Write the failing Rust module tests**

Create `apps/pos-app/src-tauri/src/auth/mod.rs` with tests first. The initial file can contain only the test module and compile-failing references to the intended API.

```rust
#[cfg(test)]
mod tests {
    use serde_json::json;
    use std::sync::Mutex;

    #[test]
    fn save_token_args_serialize_for_kotlin_bridge() {
        let args = super::SaveAuthTokenArgs {
            token: "session-1".to_string(),
        };

        assert_eq!(
            serde_json::to_value(args).expect("args should serialize"),
            json!({ "token": "session-1" })
        );
    }

    #[test]
    fn desktop_store_saves_reads_and_clears_token_in_memory() {
        let store = super::AuthTokenStore::<tauri::Wry> {
            token: Mutex::new(None),
            _marker: std::marker::PhantomData,
        };

        store.save_token("session-1".to_string()).unwrap();
        assert_eq!(store.get_token().unwrap(), Some("session-1".to_string()));

        store.clear_token().unwrap();
        assert_eq!(store.get_token().unwrap(), None);
    }
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml auth::tests
```

Expected: FAIL because `auth` is not registered in `lib.rs` yet, or because `SaveAuthTokenArgs` / `AuthTokenStore` do not exist.

**Step 3: Write minimal Rust bridge implementation**

Implement the bridge in `apps/pos-app/src-tauri/src/auth/mod.rs` following `hardware/printer.rs`:

```rust
use serde::Serialize;
#[cfg(not(target_os = "android"))]
use std::sync::Mutex;
use tauri::{plugin::TauriPlugin, Manager, Runtime};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.sakti_dev.sakti_pos.auth";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAuthTokenArgs {
    pub token: String,
}

pub struct AuthTokenStore<R: Runtime> {
    #[cfg(target_os = "android")]
    mobile_plugin_handle: tauri::plugin::PluginHandle<R>,
    #[cfg(not(target_os = "android"))]
    token: Mutex<Option<String>>,
    #[cfg(not(target_os = "android"))]
    _marker: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> AuthTokenStore<R> {
    fn save_token(&self, token: String) -> Result<(), String> {
        #[cfg(target_os = "android")]
        {
            return self
                .mobile_plugin_handle
                .run_mobile_plugin("saveToken", SaveAuthTokenArgs { token })
                .map_err(|error| error.to_string());
        }

        #[cfg(not(target_os = "android"))]
        {
            let mut stored_token = self
                .token
                .lock()
                .map_err(|_| "Auth token memory store lock was poisoned".to_string())?;
            *stored_token = Some(token);
            Ok(())
        }
    }

    fn get_token(&self) -> Result<Option<String>, String> {
        #[cfg(target_os = "android")]
        {
            return self
                .mobile_plugin_handle
                .run_mobile_plugin("getToken", serde_json::json!({}))
                .map_err(|error| error.to_string());
        }

        #[cfg(not(target_os = "android"))]
        {
            let stored_token = self
                .token
                .lock()
                .map_err(|_| "Auth token memory store lock was poisoned".to_string())?;
            Ok(stored_token.clone())
        }
    }

    fn clear_token(&self) -> Result<(), String> {
        #[cfg(target_os = "android")]
        {
            return self
                .mobile_plugin_handle
                .run_mobile_plugin("clearToken", serde_json::json!({}))
                .map_err(|error| error.to_string());
        }

        #[cfg(not(target_os = "android"))]
        {
            let mut stored_token = self
                .token
                .lock()
                .map_err(|_| "Auth token memory store lock was poisoned".to_string())?;
            *stored_token = None;
            Ok(())
        }
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("auth-token")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let mobile_plugin_handle =
                    api.register_android_plugin(PLUGIN_IDENTIFIER, "AuthTokenPlugin")?;
                app.manage(AuthTokenStore::<R> {
                    mobile_plugin_handle,
                });
            }

            #[cfg(not(target_os = "android"))]
            {
                let _ = api;
                app.manage(AuthTokenStore::<R> {
                    token: Mutex::new(None),
                    _marker: std::marker::PhantomData,
                });
            }

            Ok(())
        })
        .build()
}

#[tauri::command]
pub async fn save_auth_token<R: Runtime>(
    app: tauri::AppHandle<R>,
    token: String,
) -> Result<(), String> {
    app.state::<AuthTokenStore<R>>().save_token(token)
}

#[tauri::command]
pub async fn get_auth_token<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<String>, String> {
    app.state::<AuthTokenStore<R>>().get_token()
}

#[tauri::command]
pub async fn clear_auth_token<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    app.state::<AuthTokenStore<R>>().clear_token()
}
```

**Step 4: Register module and commands minimally**

Modify `apps/pos-app/src-tauri/src/lib.rs`:

- Add `mod auth;`
- Add `.plugin(auth::init())` near other custom plugins.
- Add commands to `tauri::generate_handler!`:
  - `auth::save_auth_token`
  - `auth::get_auth_token`
  - `auth::clear_auth_token`

**Step 5: Run test to verify it passes**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml auth::tests
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/pos-app/src-tauri/src/auth/mod.rs apps/pos-app/src-tauri/src/lib.rs
git commit -m "feat(pos): add native auth token bridge"
```

---

### Task 3: Add Kotlin Unit Tests For Encrypted Token Storage Helpers

**Files:**
- Create: `apps/pos-app/src-tauri/gen/android/app/src/main/java/com/sakti_dev/sakti_pos/auth/AuthTokenPlugin.kt`
- Create: `apps/pos-app/src-tauri/gen/android/app/src/test/java/com/sakti_dev/sakti_pos/auth/AuthTokenPluginTest.kt`

**Step 1: Write failing Kotlin tests around pure helper behavior**

Do not try to unit-test Android Keystore itself in local JVM tests. Instead, isolate the record encoding/decoding and decrypt-failure handling so the dangerous edge cases are covered without Android instrumentation.

```kotlin
package com.sakti_dev.sakti_pos.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AuthTokenPluginTest {
    @Test
    fun tokenRecordRoundTripsThroughSharedPreferenceValue() {
        val record = EncryptedTokenRecord(
            ivBase64 = "aXY=",
            ciphertextBase64 = "Y2lwaGVy",
        )

        val serialized = record.toPreferenceValue()

        assertEquals(record, EncryptedTokenRecord.fromPreferenceValue(serialized))
    }

    @Test
    fun malformedPreferenceValueReturnsNull() {
        assertNull(EncryptedTokenRecord.fromPreferenceValue("not-json"))
        assertNull(EncryptedTokenRecord.fromPreferenceValue("""{"iv":"missing"}"""))
    }

    @Test
    fun emptyTokenIsRejectedBeforeEncryption() {
        val result = validateTokenForStorage("")

        assertEquals("Token cannot be empty", result)
    }
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/pos-app/src-tauri/gen/android
./gradlew :app:testUniversalDebugUnitTest --tests 'com.sakti_dev.sakti_pos.auth.AuthTokenPluginTest'
```

Expected: FAIL because `AuthTokenPlugin.kt`, `EncryptedTokenRecord`, and `validateTokenForStorage` do not exist.

**Step 3: Implement minimal Kotlin plugin and helpers**

Create `apps/pos-app/src-tauri/gen/android/app/src/main/java/com/sakti_dev/sakti_pos/auth/AuthTokenPlugin.kt`.

Important implementation details:

- Package: `com.sakti_dev.sakti_pos.auth`
- Tauri plugin annotation: `@TauriPlugin`
- SharedPreferences file: `sakti_pos_auth_token_store`
- SharedPreferences key: `session_token`
- Keystore alias: `sakti_pos_auth_token_v1`
- Cipher: `AES/GCM/NoPadding`
- GCM tag length: `128`
- IV source: generated by `Cipher.init(Cipher.ENCRYPT_MODE, key)`, never reuse manually.
- On decrypt failure: remove the preference key and resolve `null`.
- Never log the token, IV, or ciphertext.

Skeleton:

```kotlin
package com.sakti_dev.sakti_pos.auth

import android.app.Activity
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private const val TAG = "SaktiAuthToken"
private const val PREF_NAME = "sakti_pos_auth_token_store"
private const val PREF_SESSION_TOKEN = "session_token"
private const val KEY_ALIAS = "sakti_pos_auth_token_v1"
private const val ANDROID_KEYSTORE = "AndroidKeyStore"
private const val TRANSFORMATION = "AES/GCM/NoPadding"
private const val GCM_TAG_BITS = 128

@InvokeArg
class SaveTokenArgs {
    lateinit var token: String
}

data class EncryptedTokenRecord(
    val ivBase64: String,
    val ciphertextBase64: String,
) {
    fun toPreferenceValue(): String {
        return JSONObject()
            .put("ivBase64", ivBase64)
            .put("ciphertextBase64", ciphertextBase64)
            .toString()
    }

    companion object {
        fun fromPreferenceValue(value: String): EncryptedTokenRecord? {
            return try {
                val json = JSONObject(value)
                val iv = json.optString("ivBase64")
                val ciphertext = json.optString("ciphertextBase64")
                if (iv.isBlank() || ciphertext.isBlank()) {
                    null
                } else {
                    EncryptedTokenRecord(iv, ciphertext)
                }
            } catch (error: Exception) {
                null
            }
        }
    }
}

fun validateTokenForStorage(token: String): String? {
    return if (token.isBlank()) "Token cannot be empty" else null
}

@TauriPlugin
class AuthTokenPlugin(private val activity: Activity) : Plugin(activity) {
    private val preferences: SharedPreferences by lazy {
        activity.getSharedPreferences(PREF_NAME, Activity.MODE_PRIVATE)
    }

    @Command
    fun saveToken(invoke: Invoke) {
        val args = invoke.parseArgs(SaveTokenArgs::class.java)
        val validationError = validateTokenForStorage(args.token)
        if (validationError != null) {
            invoke.reject(validationError)
            return
        }

        try {
            val record = encryptToken(args.token)
            preferences.edit().putString(PREF_SESSION_TOKEN, record.toPreferenceValue()).apply()
            invoke.resolve()
        } catch (error: Exception) {
            Log.e(TAG, "saveToken failed", error)
            invoke.reject("Failed to save auth token")
        }
    }

    @Command
    fun getToken(invoke: Invoke) {
        val value = preferences.getString(PREF_SESSION_TOKEN, null)
        if (value == null) {
            invoke.resolve(null)
            return
        }

        val record = EncryptedTokenRecord.fromPreferenceValue(value)
        if (record == null) {
            clearStoredToken()
            invoke.resolve(null)
            return
        }

        try {
            invoke.resolve(decryptToken(record))
        } catch (error: Exception) {
            Log.w(TAG, "getToken decrypt failed; clearing stored token", error)
            clearStoredToken()
            invoke.resolve(null)
        }
    }

    @Command
    fun clearToken(invoke: Invoke) {
        clearStoredToken()
        invoke.resolve()
    }

    private fun clearStoredToken() {
        preferences.edit().remove(PREF_SESSION_TOKEN).apply()
    }

    private fun encryptToken(token: String): EncryptedTokenRecord {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey())
        val ciphertext = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        return EncryptedTokenRecord(
            ivBase64 = Base64.encodeToString(cipher.iv, Base64.NO_WRAP),
            ciphertextBase64 = Base64.encodeToString(ciphertext, Base64.NO_WRAP),
        )
    }

    private fun decryptToken(record: EncryptedTokenRecord): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        val iv = Base64.decode(record.ivBase64, Base64.NO_WRAP)
        val ciphertext = Base64.decode(record.ciphertextBase64, Base64.NO_WRAP)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateSecretKey(), GCMParameterSpec(GCM_TAG_BITS, iv))
        return String(cipher.doFinal(ciphertext), Charsets.UTF_8)
    }

    private fun getOrCreateSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val existing = keyStore.getKey(KEY_ALIAS, null)
        if (existing is SecretKey) {
            return existing
        }

        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            ANDROID_KEYSTORE,
        )
        keyGenerator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return keyGenerator.generateKey()
    }
}
```

**Step 4: Run Kotlin unit test to verify it passes**

Run:

```bash
cd apps/pos-app/src-tauri/gen/android
./gradlew :app:testUniversalDebugUnitTest --tests 'com.sakti_dev.sakti_pos.auth.AuthTokenPluginTest'
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src-tauri/gen/android/app/src/main/java/com/sakti_dev/sakti_pos/auth/AuthTokenPlugin.kt apps/pos-app/src-tauri/gen/android/app/src/test/java/com/sakti_dev/sakti_pos/auth/AuthTokenPluginTest.kt
git commit -m "feat(pos): add Android keystore auth token plugin"
```

---

### Task 4: Rewrite AuthStorage To Use Native Commands And Legacy Migration

**Files:**
- Modify: `apps/pos-app/src/lib/auth/storage.ts`
- Test: `apps/pos-app/src/lib/auth/__test__/storage.test.ts`

**Step 1: Run existing failing test again**

Run:

```bash
bun test apps/pos-app/src/lib/auth/__test__/storage.test.ts
```

Expected: FAIL from Task 1 remains until `storage.ts` is rewritten.

**Step 2: Implement minimal TypeScript storage rewrite**

Replace Stronghold usage in `apps/pos-app/src/lib/auth/storage.ts` with command invocation.

Required behavior:

- `saveToken(token)`:
  - set `cachedToken`
  - remove legacy `localStorage` item
  - call `invoke("save_auth_token", { token })`
  - log failure with `storageLogger.error("native_token_persist:failed", err)` without logging token
- `getToken()`:
  - return `cachedToken` if present
  - if legacy `localStorage` token exists, save to native storage, remove legacy key, cache token, return it
  - otherwise call `invoke<string | null>("get_auth_token")`
  - cache non-null native token
  - on error, log `native_token_load:failed`, remove legacy key, return `null`
- `clearToken()`:
  - clear memory cache
  - remove legacy key
  - call `invoke("clear_auth_token")`
  - log failure with `native_token_clear:failed`

Implementation shape:

```ts
import { invoke } from "@tauri-apps/api/core";
import { createLogger } from "~/lib/logger";

const storageLogger = createLogger({
  domain: "AUTH",
  module: "auth",
  scope: "storage",
});

const LOCAL_KEY = "sakti-pos:session-token";

let cachedToken: string | null = null;

async function saveTokenNative(token: string): Promise<void> {
  await invoke("save_auth_token", { token });
}

async function getTokenNative(): Promise<string | null> {
  return await invoke<string | null>("get_auth_token");
}

async function clearTokenNative(): Promise<void> {
  await invoke("clear_auth_token");
}

async function migrateLegacyToken(token: string): Promise<void> {
  await saveTokenNative(token);
  localStorage.removeItem(LOCAL_KEY);
}

export const AuthStorage = {
  async saveToken(token: string): Promise<void> {
    cachedToken = token;
    localStorage.removeItem(LOCAL_KEY);
    try {
      await saveTokenNative(token);
    } catch (err) {
      storageLogger.error("native_token_persist:failed", err);
    }
  },

  async getToken(): Promise<string | null> {
    if (cachedToken) {
      return cachedToken;
    }

    const legacyToken = localStorage.getItem(LOCAL_KEY);
    if (legacyToken) {
      try {
        await migrateLegacyToken(legacyToken);
      } catch (err) {
        storageLogger.error("legacy_token_migration:failed", err);
        localStorage.removeItem(LOCAL_KEY);
        return null;
      }
      cachedToken = legacyToken;
      return legacyToken;
    }

    try {
      const token = await getTokenNative();
      cachedToken = token;
      return token;
    } catch (err) {
      storageLogger.error("native_token_load:failed", err);
      localStorage.removeItem(LOCAL_KEY);
      return null;
    }
  },

  async clearToken(): Promise<void> {
    cachedToken = null;
    localStorage.removeItem(LOCAL_KEY);
    try {
      await clearTokenNative();
    } catch (err) {
      storageLogger.error("native_token_clear:failed", err);
    }
  },
};
```

**Step 3: Run test to verify it passes**

Run:

```bash
bun test apps/pos-app/src/lib/auth/__test__/storage.test.ts
```

Expected: PASS.

**Step 4: Run nearby auth tests**

Run:

```bash
bun test apps/pos-app/src/lib/auth/__test__/cloud.test.ts apps/pos-app/src/lib/auth/__test__/provider.test.ts apps/pos-app/src/store/__test__/auth.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src/lib/auth/storage.ts apps/pos-app/src/lib/auth/__test__/storage.test.ts
git commit -m "feat(pos): migrate auth storage to native token commands"
```

---

### Task 5: Remove Stronghold And Argon2 Dependencies

**Files:**
- Modify: `apps/pos-app/src-tauri/Cargo.toml`
- Modify: `apps/pos-app/src-tauri/Cargo.lock`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`
- Modify: `apps/pos-app/src-tauri/capabilities/default.json`
- Modify: `apps/pos-app/package.json`
- Modify lockfile for package manager if present: `bun.lock`, `bun.lockb`, or workspace lockfile

**Step 1: Verify tests are green before deletion**

Run:

```bash
bun test apps/pos-app/src/lib/auth/__test__/storage.test.ts
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml auth::tests
```

Expected: PASS.

**Step 2: Remove Rust Stronghold setup**

Modify `apps/pos-app/src-tauri/src/lib.rs`:

- Remove `use argon2::{hash_raw, Config, Variant, Version};`
- Remove `use tauri_plugin_stronghold::Builder;`
- Remove the `.plugin(Builder::new(...).build())` Stronghold block.
- Keep `.plugin(auth::init())`.

**Step 3: Remove Cargo dependencies**

Modify `apps/pos-app/src-tauri/Cargo.toml`:

- Remove `tauri-plugin-stronghold = "2"`
- Remove `rust-argon2 = "3"`

Then run:

```bash
cargo check --manifest-path apps/pos-app/src-tauri/Cargo.toml
```

Expected: PASS and `Cargo.lock` removes Stronghold/Argon2 dependency subtrees where no longer needed.

**Step 4: Remove frontend Stronghold package**

Modify `apps/pos-app/package.json`:

- Remove `@tauri-apps/plugin-stronghold`.

Run the project package-manager install/update command used in this repo. Prefer:

```bash
bun install
```

Expected: lockfile updates and no package resolution errors.

**Step 5: Remove capabilities**

Modify `apps/pos-app/src-tauri/capabilities/default.json`:

- Remove:
  - `stronghold:default`
  - `stronghold:allow-initialize`
  - `stronghold:allow-create-client`
  - `stronghold:allow-load-client`
  - `stronghold:allow-save`
  - `stronghold:allow-save-store-record`
  - `stronghold:allow-get-store-record`
  - `stronghold:allow-remove-store-record`

Do not add permissions for the custom native plugin unless Tauri requires a generated permission; existing custom plugins in this repo do not use capability permissions for app commands.

**Step 6: Verify Stronghold is gone**

Run:

```bash
rg -n "stronghold|Stronghold|tauri-plugin-stronghold|rust-argon2|argon2::" apps/pos-app apps/pos-app/src-tauri -S
```

Expected: no matches except historical docs/plans if the search includes `docs/`.

Run:

```bash
cargo tree --manifest-path apps/pos-app/src-tauri/Cargo.toml -i tauri-plugin-stronghold
cargo tree --manifest-path apps/pos-app/src-tauri/Cargo.toml -i libsodium-sys-stable
```

Expected: commands should fail with "package ID specification did not match any packages" or equivalent, confirming removal.

**Step 7: Commit**

```bash
git add apps/pos-app/src-tauri/Cargo.toml apps/pos-app/src-tauri/Cargo.lock apps/pos-app/src-tauri/src/lib.rs apps/pos-app/src-tauri/capabilities/default.json apps/pos-app/package.json bun.lock*
git commit -m "chore(pos): remove Stronghold auth storage dependencies"
```

---

### Task 6: Add Android Build Verification And Native Plugin Smoke Checks

**Files:**
- No production code unless a previous task revealed missing registration.
- Optional docs only if build commands differ from this plan.

**Step 1: Run Rust verification**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
cargo check --manifest-path apps/pos-app/src-tauri/Cargo.toml
```

Expected: PASS. Existing host-only dead-code warnings in `src/android/fs.rs` may remain.

**Step 2: Run TypeScript verification**

Run:

```bash
bun test apps/pos-app/src/lib/auth/__test__/storage.test.ts apps/pos-app/src/lib/auth/__test__/cloud.test.ts apps/pos-app/src/lib/auth/__test__/provider.test.ts apps/pos-app/src/store/__test__/auth.test.ts
bun run --cwd apps/pos-app typecheck
```

Expected: PASS.

**Step 3: Run Kotlin verification**

Run:

```bash
cd apps/pos-app/src-tauri/gen/android
./gradlew :app:testUniversalDebugUnitTest --tests 'com.sakti_dev.sakti_pos.auth.AuthTokenPluginTest'
./gradlew :app:assembleUniversalDebug
```

Expected: PASS. If the test variant name differs on the machine, inspect available tasks:

```bash
cd apps/pos-app/src-tauri/gen/android
./gradlew :app:tasks --all | grep -i unit
```

**Step 4: Build release artifact for size comparison**

Before the Stronghold removal branch is merged, record the current baseline if not already recorded:

```bash
bun tauri android build
find apps/pos-app/src-tauri/gen/android/app/build/outputs -type f \( -name '*.apk' -o -name '*.aab' \) -exec du -h {} \;
```

Then run the same command after removal and compare sizes.

Expected: release APK/AAB should shrink. The exact reduction must be measured; do not claim a number without artifact evidence.

**Step 5: Commit verification note if useful**

If size comparison is material, add a short report:

- Create: `docs/reports/2026-05-17-auth-token-storage-size.md`

Include:

- baseline artifact path and size
- new artifact path and size
- commands used
- caveat whether APK is universal or ABI-specific

Commit:

```bash
git add docs/reports/2026-05-17-auth-token-storage-size.md
git commit -m "docs(pos): record auth storage size comparison"
```

---

### Task 7: Manual Verification Guide

**Files:**
- No code changes.

**Manual UI Steps:**

1. Install a build that still has the legacy `localStorage` token path.
2. Log in successfully.
3. Update to the native-token-storage build without clearing app data.
4. Open the app.
5. Confirm the user remains authenticated.
6. Force-close and reopen the app.
7. Confirm the user remains authenticated from native storage.
8. Log out.
9. Force-close and reopen the app.
10. Confirm the login screen appears.

**Log Checks:**

Read `docs/DOCUMENTED-LOG-PREFIX.md` before changing or adding log prefixes. For this change, prefer existing `AUTH` domain logs.

Normal auth investigation:

```bash
PID="$(adb shell pidof -s com.sakti_dev.sakti_pos | tr -d '\r')" && adb logcat -v brief --pid="$PID" | grep --line-buffered -iE '\[(JS|RUST)\] \[(AUTH|SYNC|DB|UI):|native_token|legacy_token_migration'
```

Crash investigation:

```bash
PID="$(adb shell pidof -s com.sakti_dev.sakti_pos | tr -d '\r')" && adb logcat -v brief --pid="$PID" | grep --line-buffered -iE '\[(JS|RUST)\] \[(AUTH|SYNC|DB|UI):|AndroidRuntime|libc|fatal|exception|crash|native_token|legacy_token_migration'
```

**State Checks:**

Check that legacy WebView storage is removed after migration:

```bash
adb shell run-as com.sakti_dev.sakti_pos find app_webview -type f | grep -i local
```

If direct WebView inspection is not practical, add a temporary debug-only JS check during manual testing:

```ts
localStorage.getItem("sakti-pos:session-token")
```

Expected after migration: `null`.

**Edge Cases:**

- Corrupt stored encrypted payload: manually clear or corrupt app shared preferences if device allows `run-as`; expected behavior is logout, not crash.
- App data restored to a different device: Android Keystore key will not match; expected behavior is native plugin clears the stored payload and `AuthStorage.getToken()` returns `null`.

---

## Final Full Verification

Run all relevant checks before declaring the change complete:

```bash
bun test apps/pos-app/src/lib/auth/__test__/storage.test.ts apps/pos-app/src/lib/auth/__test__/cloud.test.ts apps/pos-app/src/lib/auth/__test__/provider.test.ts apps/pos-app/src/store/__test__/auth.test.ts
bun run --cwd apps/pos-app typecheck
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
cargo check --manifest-path apps/pos-app/src-tauri/Cargo.toml
cd apps/pos-app/src-tauri/gen/android && ./gradlew :app:testUniversalDebugUnitTest --tests 'com.sakti_dev.sakti_pos.auth.AuthTokenPluginTest'
```

Then build and measure:

```bash
bun tauri android build
find apps/pos-app/src-tauri/gen/android/app/build/outputs -type f \( -name '*.apk' -o -name '*.aab' \) -exec du -h {} \;
```

## Completion Criteria

- Stronghold and `rust-argon2` are absent from Cargo dependencies and lockfile.
- `@tauri-apps/plugin-stronghold` is absent from app dependencies and lockfile.
- Default capabilities no longer grant Stronghold permissions.
- Auth token persists across app restarts on Android.
- Legacy `localStorage` token migrates silently and is removed.
- Decrypt/corrupt storage failures return `null` and do not crash.
- Release artifact size is measured before and after.
