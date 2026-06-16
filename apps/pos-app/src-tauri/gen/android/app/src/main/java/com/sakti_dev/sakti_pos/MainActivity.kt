package com.sakti_dev.sakti_pos

import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding

class MainActivity : TauriActivity() {
    companion object {
        @Volatile
        var statusBarOverlay: View? = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        val contentView = window.decorView
            .findViewById<View>(android.R.id.content)

        contentView.setBackgroundResource(R.color.app_background)

        ViewCompat.setOnApplyWindowInsetsListener(contentView) { view, windowInsets ->
            val systemBars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars())

            view.updatePadding(
                top = systemBars.top,
                bottom = 0,
            )

            // Create or resize a dedicated overlay View that sits in the
            // status bar region, ON TOP of the system's own background.
            // This is the only view whose runtime background change actually
            // repaints on Android 16.
            if (statusBarOverlay == null) {
                val overlay = View(this)
                overlay.setBackgroundResource(R.color.app_background)
                statusBarOverlay = overlay
                val decorView = window.decorView as ViewGroup
                decorView.addView(
                    overlay,
                    FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        systemBars.top,
                        Gravity.TOP or Gravity.START,
                    ),
                )
            } else {
                val params = statusBarOverlay!!.layoutParams as FrameLayout.LayoutParams
                params.height = systemBars.top
                statusBarOverlay!!.layoutParams = params
            }

            windowInsets
        }
    }
}
