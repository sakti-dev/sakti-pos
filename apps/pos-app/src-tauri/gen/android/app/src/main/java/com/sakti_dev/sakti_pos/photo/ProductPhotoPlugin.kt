package com.sakti_dev.sakti_pos.photo

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import androidx.activity.result.ActivityResult
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import java.io.ByteArrayOutputStream
import java.io.File

private const val TAG = "SaktiPhotoPicker"
private const val CAMERA_PERMISSION = Manifest.permission.CAMERA
private const val PHOTO_INPUT_DIR = "product_photo_inputs"
private const val PHOTO_TRANSIENT_DIR = "product_photo_transient"
private const val PREVIEW_MAX_EDGE = 320

internal fun isStartupDeletableTempPhotoPath(path: String): Boolean {
    return path.split(File.separatorChar).contains(PHOTO_TRANSIENT_DIR)
}

@InvokeArg
class PickPhotoArgs {
    lateinit var source: String
}

@TauriPlugin(
    permissions = [
        Permission(strings = [Manifest.permission.CAMERA], alias = "camera"),
    ],
)
class ProductPhotoPlugin(private val activity: Activity) : Plugin(activity) {
    private var currentPhotoFile: File? = null

    init {
        cleanupTransientPhotoInputs()
    }

    @Command
    fun pickPhoto(invoke: Invoke) {
        val args = invoke.parseArgs(PickPhotoArgs::class.java)
        Log.i(TAG, "pickPhoto source=${args.source}")

        when (args.source) {
            "camera" -> pickCamera(invoke)
            "gallery" -> invoke.reject("Gallery picking is handled by Android FS")
            else -> invoke.reject("Unsupported photo source: ${args.source}")
        }
    }

    private fun pickCamera(invoke: Invoke) {
        if (ContextCompat.checkSelfPermission(activity, CAMERA_PERMISSION) != PackageManager.PERMISSION_GRANTED) {
            Log.i(TAG, "requesting camera permission")
            requestPermissionForAlias("camera", invoke, "handleCameraPermissionResult")
            return
        }

        launchCamera(invoke)
    }

    @PermissionCallback
    fun handleCameraPermissionResult(invoke: Invoke) {
        if (ContextCompat.checkSelfPermission(activity, CAMERA_PERMISSION) == PackageManager.PERMISSION_GRANTED) {
            launchCamera(invoke)
            return
        }

        Log.e(TAG, "camera permission denied")
        invoke.reject("Camera permission denied")
    }

    private fun launchCamera(invoke: Invoke) {
        try {
            val photoFile = createTempPhotoFile("photo", "jpg")
            currentPhotoFile = photoFile
            val photoUri = FileProvider.getUriForFile(
                activity,
                "${activity.packageName}.fileprovider",
                photoFile,
            )

            val cameraIntent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                putExtra(MediaStore.EXTRA_OUTPUT, photoUri)
                addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }

            Log.i(TAG, "launchCamera path=${photoFile.absolutePath}")
            startActivityForResult(invoke, cameraIntent, "handleCameraResult")
        } catch (error: Exception) {
            Log.e(TAG, "launchCamera failed", error)
            currentPhotoFile = null
            invoke.reject("Failed to launch camera: ${error.message}")
        }
    }

    @ActivityCallback
    fun handleCameraResult(invoke: Invoke, result: ActivityResult) {
        Log.i(TAG, "cameraResult resultCode=${result.resultCode}")

        if (result.resultCode != Activity.RESULT_OK) {
            currentPhotoFile?.delete()
            currentPhotoFile = null
            invoke.reject("Camera operation was cancelled by user")
            return
        }

        val photoFile = currentPhotoFile
        if (photoFile == null || !photoFile.exists()) {
            currentPhotoFile = null
            invoke.reject("Captured photo file was not found")
            return
        }

        currentPhotoFile = null
        invoke.resolveObject(photoResult(photoFile, "image/jpeg", "camera"))
    }

    private fun createTempPhotoFile(prefix: String, extension: String): File {
        val cacheDir = File(activity.cacheDir, PHOTO_INPUT_DIR)
        if (!cacheDir.exists() && !cacheDir.mkdirs()) {
            throw IllegalStateException("Failed to create product photo cache directory")
        }

        val safeExtension = extension.trim('.').ifBlank { "jpg" }
        return File(cacheDir, "${prefix}_${System.currentTimeMillis()}.$safeExtension")
    }

    private fun cleanupTransientPhotoInputs() {
        val cacheDir = File(activity.cacheDir, PHOTO_TRANSIENT_DIR)
        val files = cacheDir.listFiles() ?: return
        for (file in files) {
            if (
                file.isFile &&
                isStartupDeletableTempPhotoPath(file.absolutePath) &&
                !file.delete()
            ) {
                Log.w(TAG, "failed to delete stale temp photo path=${file.absolutePath}")
            }
        }
    }

    private fun photoResult(
        file: File,
        mimeType: String,
        source: String,
        originalFilename: String = file.name,
    ): Map<String, String> {
        val previewBase64 = createPreviewBase64(file)
        return mapOf(
            "path" to file.absolutePath,
            "originalFilename" to originalFilename,
            "mimeType" to mimeType,
            "previewBase64" to previewBase64,
            "previewMimeType" to "image/jpeg",
            "source" to source,
        )
    }

    private fun createPreviewBase64(file: File): String {
        return try {
            val bounds = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            BitmapFactory.decodeFile(file.absolutePath, bounds)

            var sampleSize = 1
            var previewWidth = bounds.outWidth
            var previewHeight = bounds.outHeight
            while (previewWidth > PREVIEW_MAX_EDGE || previewHeight > PREVIEW_MAX_EDGE) {
                sampleSize *= 2
                previewWidth /= 2
                previewHeight /= 2
            }

            val bitmap = BitmapFactory.decodeFile(
                file.absolutePath,
                BitmapFactory.Options().apply { inSampleSize = sampleSize },
            ) ?: return ""
            val output = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, 75, output)
            bitmap.recycle()
            Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
        } catch (error: Exception) {
            Log.w(TAG, "failed to create preview path=${file.absolutePath}", error)
            ""
        }
    }
}
