package com.sakti_dev.sakti_pos.theme

import android.app.Activity
import android.graphics.Color
import android.view.View
import androidx.core.view.WindowCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@InvokeArg
class SetColorArgs {
    lateinit var color: String
    var isDark: Boolean = false
}

@TauriPlugin
class ThemePlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun setStatusBarBackground(invoke: Invoke) {
        val args = invoke.parseArgs(SetColorArgs::class.java)
        val colorHex = args.color
        activity.runOnUiThread {
            try {
                val color = Color.parseColor(colorHex)
                val overlay = com.sakti_dev.sakti_pos.MainActivity.statusBarOverlay
                overlay?.setBackgroundColor(color)

                // Toggle status bar icon contrast so icons stay visible
                val window = activity.window
                val contentView = activity.findViewById<View>(android.R.id.content)
                val insetsController =
                    WindowCompat.getInsetsController(window, contentView)
                insetsController.isAppearanceLightStatusBars = !args.isDark

                invoke.resolve()
            } catch (error: Exception) {
                invoke.reject("Failed to set status bar color: ${error.message}")
            }
        }
    }
}
