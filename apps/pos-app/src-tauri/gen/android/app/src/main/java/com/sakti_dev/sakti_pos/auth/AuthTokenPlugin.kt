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
import app.tauri.plugin.JSObject
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
        return """{"ivBase64":"$ivBase64","ciphertextBase64":"$ciphertextBase64"}"""
    }

    companion object {
        fun fromPreferenceValue(value: String): EncryptedTokenRecord? {
            val match = Regex(
                """^\{"ivBase64":"([^"]+)","ciphertextBase64":"([^"]+)"\}$"""
            ).matchEntire(value) ?: return null
            return EncryptedTokenRecord(
                ivBase64 = match.groupValues[1],
                ciphertextBase64 = match.groupValues[2],
            )
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
            invoke.resolve(JSObject().apply { put("token", JSONObject.NULL) })
            return
        }

        try {
            invoke.resolve(JSObject().apply { put("token", decryptToken(record)) })
        } catch (error: Exception) {
            Log.w(TAG, "getToken decrypt failed; clearing stored token", error)
            clearStoredToken()
            invoke.resolve(JSObject().apply { put("token", JSONObject.NULL) })
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
                .setUserAuthenticationRequired(false)
                .build(),
        )
        return keyGenerator.generateKey()
    }
}
