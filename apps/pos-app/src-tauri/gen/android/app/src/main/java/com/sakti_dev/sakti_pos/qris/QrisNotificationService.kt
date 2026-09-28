package com.sakti_dev.sakti_pos.qris

import android.app.Notification
import android.content.ComponentName
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

/**
 * Watches notifications from merchant-selected packages only (fast-path
 * allowlist read from SharedPreferences; no bridge involvement). Parses the
 * Rupiah amount, appends to the on-device ring buffer, and best-effort emits
 * to the webview when it is alive.
 */
class QrisNotificationService : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) {
            return
        }
        val packageName = sbn.packageName ?: return
        val prefs = PaymentEventStore.prefs(applicationContext)
        if (packageName !in PaymentEventStore.readAllowedPackages(prefs)) {
            return
        }
        val extras = sbn.notification?.extras ?: return
        val fullText = RupiahParser.assembleNotificationText(
            title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty(),
            text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty(),
            bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString().orEmpty(),
            textLines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
                ?.map { it.toString() }
                .orEmpty(),
        )
        if (fullText.isBlank()) {
            return
        }
        val parseStartedAt = android.os.SystemClock.elapsedRealtime()
        val amount = RupiahParser.parseRupiah(fullText)
        if (amount == null || amount <= 0) {
            Log.i(TAG, "[QRIS_DETECT:EVENT_DROPPED_NO_AMOUNT] package=$packageName")
            return
        }
        val appLabel = resolveAppLabel(packageName)
        val event = CapturedPaymentEvent(
            packageName = packageName,
            appLabel = appLabel,
            amountRupiah = amount,
            rawText = fullText,
            postTimeMillis = sbn.postTime,
        )
        val buffered = PaymentEventStore.appendToPrefs(applicationContext, event)
        Log.i(
            TAG,
            "[QRIS_DETECT:EVENT_CAPTURED] package=$packageName amount=$amount postTime=${event.postTimeMillis} buffered=${buffered.size} elapsedMs=${android.os.SystemClock.elapsedRealtime() - parseStartedAt}",
        )
        QrisBridgePlugin.emitPaymentReceived(event)
    }

    override fun onListenerDisconnected() {
        NotificationListenerService.requestRebind(
            ComponentName(this, QrisNotificationService::class.java),
        )
        super.onListenerDisconnected()
    }

    private fun resolveAppLabel(packageName: String): String {
        return runCatching {
            val pm = packageManager ?: return packageName
            val info = pm.getApplicationInfo(packageName, 0)
            pm.getApplicationLabel(info).toString()
        }.getOrDefault(packageName)
    }

    companion object {
        private const val TAG = "QrisNotificationService"
    }
}
