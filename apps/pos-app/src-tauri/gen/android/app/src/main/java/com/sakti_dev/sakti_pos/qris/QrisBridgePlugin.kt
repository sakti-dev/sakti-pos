package com.sakti_dev.sakti_pos.qris

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Build
import android.provider.Settings
import android.util.Base64
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class SetAllowedPackagesArgs {
    lateinit var packagesJson: String
}

@InvokeArg
class GetAppIconArgs {
    lateinit var packageName: String
}

@TauriPlugin
class QrisBridgePlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun getInstalledApps(invoke: Invoke) {
        val startedAt = android.os.SystemClock.elapsedRealtime()
        val pm = activity.packageManager
        val mainIntent = Intent(Intent.ACTION_MAIN, null).apply {
            addCategory(Intent.CATEGORY_LAUNCHER)
        }
        val resolveInfos = runCatching { pm.queryIntentActivities(mainIntent, 0) }
            .getOrElse { error ->
                Log.e(TAG, "getInstalledApps failed", error)
                invoke.reject("Failed to list installed apps")
                return
            }
        Log.i(
            TAG,
            "[QRIS_DETECT:GET_APPS_COMPLETED] resolved=${resolveInfos.size} elapsedMs=${android.os.SystemClock.elapsedRealtime() - startedAt}",
        )
        val apps = JSArray()
        val seen = HashSet<String>()
        for (info in resolveInfos) {
            val packageName = info.activityInfo?.packageName ?: continue
            if (!seen.add(packageName)) {
                continue
            }
            val label = runCatching {
                info.loadLabel(pm).toString()
            }.getOrDefault(packageName)
            apps.put(appEntryJson(packageName, label))
        }
        val result = JSObject()
        result.put("apps", apps)
        invoke.resolve(result)
    }

    @Command
    fun getAppIcon(invoke: Invoke) {
        val startedAt = android.os.SystemClock.elapsedRealtime()
        val args = invoke.parseArgs(GetAppIconArgs::class.java)
        val iconDataUrl = runCatching {
            val drawable = activity.packageManager.getApplicationIcon(args.packageName)
            encodeIconDataUrl(drawable)
        }.getOrNull()
        val elapsed = android.os.SystemClock.elapsedRealtime() - startedAt
        if (elapsed > 50) {
            Log.w(TAG, "[QRIS_DETECT:APP_ICON_SLOW] package=${args.packageName} elapsedMs=$elapsed")
        }
        val result = JSObject()
        result.put("iconDataUrl", iconDataUrl ?: org.json.JSONObject.NULL)
        invoke.resolve(result)
    }

    @Command
    fun setAllowedPackages(invoke: Invoke) {
        val args = invoke.parseArgs(SetAllowedPackagesArgs::class.java)
        val packages = runCatching {
            val array = org.json.JSONArray(args.packagesJson)
            buildSet {
                for (i in 0 until array.length()) {
                    add(array.optString(i))
                }
            }
        }.getOrElse {
            invoke.reject("packagesJson must be a JSON array of strings")
            return
        }
        PaymentEventStore.writeAllowedPackages(PaymentEventStore.prefs(activity), packages)
        Log.i(TAG, "[QRIS_DETECT:ALLOWLIST_SAVED] count=${packages.size}")
        invoke.resolve()
    }

    @Command
    fun getAllowedPackages(invoke: Invoke) {
        val prefs = PaymentEventStore.prefs(activity)
        val packages = PaymentEventStore.readAllowedPackages(prefs)
        val array = JSArray()
        for (pkg in packages) {
            array.put(pkg)
        }
        val result = JSObject()
        result.put("packages", array)
        invoke.resolve(result)
    }

    @Command
    fun getRecentEvents(invoke: Invoke) {
        val events = PaymentEventStore.load(PaymentEventStore.prefs(activity))
        val array = JSArray()
        for (event in events) {
            val obj = JSObject()
            obj.put("packageName", event.packageName)
            obj.put("appLabel", event.appLabel)
            obj.put("amountRupiah", event.amountRupiah)
            obj.put("rawText", event.rawText)
            obj.put("postTimeMillis", event.postTimeMillis)
            array.put(obj)
        }
        val result = JSObject()
        result.put("events", array)
        invoke.resolve(result)
    }

    @Command
    fun isNotificationAccessGranted(invoke: Invoke) {
        val granted = NotificationManagerCompat.getEnabledListenerPackages(activity)
            .contains(activity.packageName)
        val result = JSObject()
        result.put("granted", granted)
        invoke.resolve(result)
    }

    @Command
    fun openNotificationAccessSettings(invoke: Invoke) {
        runCatching {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            activity.startActivity(intent)
            invoke.resolve()
        }.getOrElse {
            invoke.reject("Failed to open notification access settings")
        }
    }

    override fun load(webView: android.webkit.WebView) {
        instance = this
        super.load(webView)
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }

    companion object {
        private const val TAG = "QrisBridgePlugin"

        @Volatile
        private var instance: QrisBridgePlugin? = null

        fun emitPaymentReceived(event: CapturedPaymentEvent) {
            val plugin = instance ?: return
            val data = JSObject()
            data.put("packageName", event.packageName)
            data.put("appLabel", event.appLabel)
            data.put("amountRupiah", event.amountRupiah)
            data.put("rawText", event.rawText)
            data.put("postTimeMillis", event.postTimeMillis)
            runCatching {
                plugin.trigger("payment-event", data)
            }
        }
    }
}

private fun encodeIconDataUrl(drawable: android.graphics.drawable.Drawable): String? =
    runCatching {
        val sizePx = 96
    val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    drawable.setBounds(0, 0, sizePx, sizePx)
    drawable.draw(canvas)
    val format = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        Bitmap.CompressFormat.WEBP_LOSSY
    } else {
        @Suppress("DEPRECATION")
        Bitmap.CompressFormat.WEBP
    }
    val out = java.io.ByteArrayOutputStream()
    bitmap.compress(format, 85, out)
    bitmap.recycle()
    val base64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    "data:image/webp;base64,$base64"
}.getOrNull()

private fun appEntryJson(packageName: String, appName: String): JSObject {
    val obj = JSObject()
    obj.put("packageName", packageName)
    obj.put("appName", appName)
    return obj
}
