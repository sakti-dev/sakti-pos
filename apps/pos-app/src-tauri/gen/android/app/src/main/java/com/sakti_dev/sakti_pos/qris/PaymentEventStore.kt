package com.sakti_dev.sakti_pos.qris

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

data class CapturedPaymentEvent(
    val packageName: String,
    val appLabel: String,
    val amountRupiah: Long,
    val rawText: String,
    val postTimeMillis: Long,
)

/**
 * Capped on-device buffer of parsed payment events. The NotificationListenerService
 * appends here even when the app UI is suspended; the webview drains this buffer
 * on resume. Events never leave the device.
 */
object PaymentEventStore {
    const val CAPACITY = 20

    fun append(existing: List<CapturedPaymentEvent>, event: CapturedPaymentEvent): List<CapturedPaymentEvent> {
        val next = existing + event
        return if (next.size > CAPACITY) next.takeLast(CAPACITY) else next
    }

    fun load(prefs: SharedPreferences): List<CapturedPaymentEvent> {
        val raw = prefs.getString(KEY_RECENT_EVENTS, null) ?: return emptyList()
        val array = runCatching { JSONArray(raw) }.getOrNull() ?: return emptyList()
        val events = mutableListOf<CapturedPaymentEvent>()
        for (i in 0 until array.length()) {
            val obj = array.optJSONObject(i) ?: continue
            val amount = obj.optLong(FIELD_AMOUNT, -1)
            if (amount <= 0) {
                continue
            }
            events.add(
                CapturedPaymentEvent(
                    packageName = obj.optString(FIELD_PACKAGE),
                    appLabel = obj.optString(FIELD_APP_LABEL),
                    amountRupiah = amount,
                    rawText = obj.optString(FIELD_RAW_TEXT),
                    postTimeMillis = obj.optLong(FIELD_POST_TIME, 0),
                ),
            )
        }
        return events.toList()
    }

    fun save(prefs: SharedPreferences, events: List<CapturedPaymentEvent>) {
        val array = JSONArray()
        for (event in events) {
            array.put(
                JSONObject()
                    .put(FIELD_PACKAGE, event.packageName)
                    .put(FIELD_APP_LABEL, event.appLabel)
                    .put(FIELD_AMOUNT, event.amountRupiah)
                    .put(FIELD_RAW_TEXT, event.rawText)
                    .put(FIELD_POST_TIME, event.postTimeMillis),
            )
        }
        prefs.edit().putString(KEY_RECENT_EVENTS, array.toString()).apply()
    }

    fun appendToPrefs(context: Context, event: CapturedPaymentEvent): List<CapturedPaymentEvent> {
        val prefs = prefs(context)
        val next = append(load(prefs), event)
        save(prefs, next)
        return next
    }

    fun readAllowedPackages(prefs: SharedPreferences): Set<String> {
        return prefs.getStringSet(KEY_ALLOWED_PACKAGES, emptySet()) ?: emptySet()
    }

    fun writeAllowedPackages(prefs: SharedPreferences, packages: Set<String>) {
        prefs.edit().putStringSet(KEY_ALLOWED_PACKAGES, packages).apply()
    }

    fun prefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    }

    private const val PREF_NAME = "qris_config"
    internal const val KEY_ALLOWED_PACKAGES = "allowed_packages"
    private const val KEY_RECENT_EVENTS = "recent_events"
    private const val FIELD_PACKAGE = "packageName"
    private const val FIELD_APP_LABEL = "appLabel"
    private const val FIELD_AMOUNT = "amountRupiah"
    private const val FIELD_RAW_TEXT = "rawText"
    private const val FIELD_POST_TIME = "postTimeMillis"
}
