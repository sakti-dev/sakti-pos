package com.sakti_dev.sakti_pos.photo

import android.Manifest
import android.app.Activity
import android.content.ContentUris
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.provider.OpenableColumns
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
import java.io.FileNotFoundException
import java.io.InputStream

private const val TAG = "SaktiPhotoPicker"
private const val CAMERA_PERMISSION = Manifest.permission.CAMERA
private const val PHOTO_INPUT_DIR = "product_photo_inputs"
private const val PREVIEW_MAX_EDGE = 320

@InvokeArg
class PickPhotoArgs {
    lateinit var source: String
}

@TauriPlugin(
    permissions = [
        Permission(strings = [Manifest.permission.CAMERA], alias = "camera"),
        Permission(strings = [Manifest.permission.READ_EXTERNAL_STORAGE], alias = "readExternalStorage"),
        Permission(strings = [Manifest.permission.READ_MEDIA_IMAGES], alias = "readMediaImages"),
    ],
)
class ProductPhotoPlugin(private val activity: Activity) : Plugin(activity) {
    private var currentPhotoFile: File? = null

    init {
        cleanupTempPhotoInputs()
    }

    @Command
    fun pickPhoto(invoke: Invoke) {
        val args = invoke.parseArgs(PickPhotoArgs::class.java)
        Log.i(TAG, "pickPhoto source=${args.source}")

        when (args.source) {
            "camera" -> pickCamera(invoke)
            "gallery" -> pickGalleryWithPermissions(invoke)
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

    private fun pickGalleryWithPermissions(invoke: Invoke) {
        val permissionAlias = galleryPermissionAlias()
        if (
            permissionAlias != null &&
            ContextCompat.checkSelfPermission(activity, galleryPermissionName()) != PackageManager.PERMISSION_GRANTED
        ) {
            Log.i(TAG, "requesting gallery read permission alias=$permissionAlias")
            requestPermissionForAlias(permissionAlias, invoke, "handleGalleryPermissionResult")
            return
        }

        pickGallery(invoke)
    }

    @PermissionCallback
    fun handleGalleryPermissionResult(invoke: Invoke) {
        val permissionName = galleryPermissionName()
        if (permissionName.isEmpty() || ContextCompat.checkSelfPermission(activity, permissionName) == PackageManager.PERMISSION_GRANTED) {
            pickGallery(invoke)
            return
        }

        Log.w(TAG, "gallery read permission denied")
        pickGallery(invoke)
    }

    private fun pickGallery(invoke: Invoke) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            type = "image/*"
            addCategory(Intent.CATEGORY_OPENABLE)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }

        Log.i(TAG, "launchGallery")
        startActivityForResult(invoke, intent, "handleGalleryResult")
    }

    @ActivityCallback
    fun handleGalleryResult(invoke: Invoke, result: ActivityResult) {
        Log.i(TAG, "galleryResult resultCode=${result.resultCode}")

        if (result.resultCode != Activity.RESULT_OK) {
            invoke.reject("Gallery operation was cancelled by user")
            return
        }

        val uri = result.data?.data
        if (uri == null) {
            invoke.reject("Gallery did not return an image")
            return
        }

        try {
            persistGalleryReadPermission(uri, result.data)
            Log.i(
                TAG,
                "galleryResult uri=$uri scheme=${uri.scheme} authority=${uri.authority} flags=${result.data?.flags ?: 0}",
            )
            val mimeType = activity.contentResolver.getType(uri) ?: "image/jpeg"
            val filename = displayNameForUri(uri)
                ?: "gallery_${System.currentTimeMillis()}.${extensionForMimeType(mimeType)}"
            val extension = filename.substringAfterLast(
                delimiter = ".",
                missingDelimiterValue = extensionForMimeType(mimeType),
            ).lowercase()
            val target = createTempPhotoFile("gallery", extension)

            openGalleryInputStream(uri).use { input ->
                if (input == null) {
                    invoke.reject("Failed to open gallery image")
                    return
                }
                target.outputStream().use { output -> input.copyTo(output) }
            }

            Log.i(TAG, "galleryCopy uri=$uri path=${target.absolutePath} mimeType=$mimeType")
            invoke.resolveObject(photoResult(target, mimeType, "gallery", filename))
        } catch (error: Exception) {
            Log.e(TAG, "gallery copy failed", error)
            invoke.reject("Failed to copy gallery image: ${error.message ?: error.javaClass.simpleName}")
        }
    }

    private fun persistGalleryReadPermission(uri: Uri, data: Intent?) {
        val flags = data?.flags ?: 0
        val hasReadGrant = (flags and Intent.FLAG_GRANT_READ_URI_PERMISSION) != 0
        val hasPersistableGrant = (flags and Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION) != 0

        if (!(hasReadGrant && hasPersistableGrant)) {
            return
        }

        try {
            activity.contentResolver.takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION,
            )
        } catch (error: SecurityException) {
            Log.w(TAG, "persist read permission failed uri=$uri", error)
        }
    }

    private fun openGalleryInputStream(uri: Uri): InputStream? {
        val candidates = galleryStreamCandidates(uri)
        var lastFailure: Exception? = null

        for (candidate in candidates) {
            try {
                val input = activity.contentResolver.openInputStream(candidate)
                if (input != null) {
                    Log.i(TAG, "galleryStream opened uri=$candidate")
                    return input
                }
            } catch (error: FileNotFoundException) {
                lastFailure = error
                Log.w(TAG, "openInputStream failed uri=$candidate", error)
            } catch (error: NullPointerException) {
                lastFailure = error
                Log.w(TAG, "openInputStream provider NPE uri=$candidate", error)
            }
        }

        for (candidate in candidates) {
            try {
                val descriptor = activity.contentResolver.openAssetFileDescriptor(candidate, "r")
                if (descriptor != null) {
                    Log.i(TAG, "galleryStream opened asset descriptor uri=$candidate")
                    return descriptor.createInputStream()
                }
            } catch (error: FileNotFoundException) {
                lastFailure = error
                Log.w(TAG, "openAssetFileDescriptor failed uri=$candidate", error)
            } catch (error: NullPointerException) {
                lastFailure = error
                Log.w(TAG, "openAssetFileDescriptor provider NPE uri=$candidate", error)
            }
        }

        if (lastFailure != null) {
            throw lastFailure
        }
        return null
    }

    private fun galleryStreamCandidates(uri: Uri): List<Uri> {
        val candidates = mutableListOf(uri)
        val externalStorageFile = externalStorageFileForDocumentUri(uri)
        if (externalStorageFile != null) {
            candidates.add(Uri.fromFile(externalStorageFile))
        }
        val mediaStoreUri = mediaStoreUriForDocumentUri(uri)
        if (mediaStoreUri != null && mediaStoreUri != uri) {
            candidates.add(mediaStoreUri)
        }
        return candidates
    }

    private fun externalStorageFileForDocumentUri(uri: Uri): File? {
        if (uri.authority != "com.android.externalstorage.documents") {
            return null
        }

        try {
            val documentId = DocumentsContract.getDocumentId(uri)
            val parts = documentId.split(":", limit = 2)
            if (parts.size != 2 || parts[0] != "primary") {
                Log.w(TAG, "unsupported external storage document uri=$uri documentId=$documentId")
                return null
            }

            val file = File(Environment.getExternalStorageDirectory(), parts[1])
            Log.i(TAG, "resolved external storage document uri=$uri file=${file.absolutePath}")
            return file
        } catch (error: Exception) {
            Log.w(TAG, "failed to resolve external storage document uri=$uri", error)
            return null
        }
    }

    private fun mediaStoreUriForDocumentUri(uri: Uri): Uri? {
        if (uri.authority != "com.android.providers.media.documents") {
            return null
        }

        try {
            val documentId = DocumentsContract.getDocumentId(uri)
            val parts = documentId.split(":")
            if (parts.size != 2) {
                Log.w(TAG, "unsupported media document id uri=$uri documentId=$documentId")
                return null
            }

            val mediaType = parts[0]
            val mediaId = parts[1].toLongOrNull()
            if (mediaId == null) {
                Log.w(TAG, "unsupported media document id uri=$uri documentId=$documentId")
                return null
            }

            val baseUri = when (mediaType) {
                "image" -> MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                "video" -> MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                else -> {
                    Log.w(TAG, "unsupported media document type uri=$uri documentId=$documentId")
                    return null
                }
            }

            val resolved = ContentUris.withAppendedId(baseUri, mediaId)
            Log.i(TAG, "resolved media document uri=$uri mediaStoreUri=$resolved")
            return resolved
        } catch (error: Exception) {
            Log.w(TAG, "failed to resolve media document uri=$uri", error)
            return null
        }
    }

    private fun createTempPhotoFile(prefix: String, extension: String): File {
        val cacheDir = File(activity.cacheDir, PHOTO_INPUT_DIR)
        if (!cacheDir.exists() && !cacheDir.mkdirs()) {
            throw IllegalStateException("Failed to create product photo cache directory")
        }

        val safeExtension = extension.trim('.').ifBlank { "jpg" }
        return File(cacheDir, "${prefix}_${System.currentTimeMillis()}.$safeExtension")
    }

    private fun cleanupTempPhotoInputs() {
        val cacheDir = File(activity.cacheDir, PHOTO_INPUT_DIR)
        val files = cacheDir.listFiles() ?: return
        for (file in files) {
            if (file.isFile && !file.delete()) {
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

    private fun displayNameForUri(uri: Uri): String? {
        return activity.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0 && cursor.moveToFirst()) {
                cursor.getString(index)
            } else {
                null
            }
        }
    }

    private fun extensionForMimeType(mimeType: String): String {
        return when (mimeType.lowercase()) {
            "image/png" -> "png"
            "image/webp" -> "webp"
            "image/heic" -> "heic"
            "image/heif" -> "heif"
            else -> "jpg"
        }
    }

    private fun galleryPermissionAlias(): String? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            "readMediaImages"
        } else {
            "readExternalStorage"
        }
    }

    private fun galleryPermissionName(): String {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Manifest.permission.READ_MEDIA_IMAGES
        } else {
            Manifest.permission.READ_EXTERNAL_STORAGE
        }
    }
}
