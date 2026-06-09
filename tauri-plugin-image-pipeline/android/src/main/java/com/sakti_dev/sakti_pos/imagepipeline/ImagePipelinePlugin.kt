package com.sakti_dev.sakti_pos.imagepipeline

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.exifinterface.media.ExifInterface
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileNotFoundException
import java.security.MessageDigest
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val TAG = "ImagePipelinePlugin"

@InvokeArg
class CompressImageArgs {
    lateinit var sourcePath: String
    var outputDir: String? = null
    var previewOutputDir: String? = null
    lateinit var originalFilename: String
    var apiLevel: Int? = null
    var maxLongEdge: Int = 400
    var previewMaxLongEdge: Int = 320
}

@InvokeArg
class PickImageArgs {
    var pickerMode: String = "image"
    var compressionMaxLongEdge: Int = 400
    var compressionPreviewMaxLongEdge: Int = 320
    var compressionQuality: Int = 75
}

data class PickImageResult(
    val jobId: String,
    val previewPath: String,
    val previewMimeType: String,
    val status: String,
)

data class AndroidCompressionResult(
    val assetPath: String,
    val previewPath: String?,
    val contentHash: String,
    val contentType: String,
    val width: Int,
    val height: Int,
    val byteSize: Long,
    val originalFilename: String,
)

data class AndroidPreviewResult(
    val previewPath: String?,
    val previewMimeType: String,
)

interface AndroidImageCodec {
    fun decode(sourceFile: File): Bitmap
    fun readOrientation(sourceFile: File): Int
    fun encode(bitmap: Bitmap, format: Bitmap.CompressFormat, quality: Int): ByteArray
    fun orient(bitmap: Bitmap, orientation: Int): Bitmap
}

class DefaultAndroidImageCodec : AndroidImageCodec {
    override fun decode(sourceFile: File): Bitmap {
        return BitmapFactory.decodeFile(sourceFile.absolutePath)
            ?: throw IllegalArgumentException("Unable to decode source image")
    }

    override fun readOrientation(sourceFile: File): Int {
        return runCatching {
            ExifInterface(sourceFile.absolutePath)
                .getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
    }

    override fun encode(
        bitmap: Bitmap,
        format: Bitmap.CompressFormat,
        quality: Int,
    ): ByteArray {
        val output = ByteArrayOutputStream()
        if (!bitmap.compress(format, quality, output)) {
            throw IllegalStateException("Android encoder failed to produce output")
        }
        return output.toByteArray()
    }

    override fun orient(bitmap: Bitmap, orientation: Int): Bitmap {
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.setScale(-1f, 1f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.setRotate(180f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> {
                matrix.setRotate(180f)
                matrix.postScale(-1f, 1f)
            }
            ExifInterface.ORIENTATION_TRANSPOSE -> {
                matrix.setRotate(90f)
                matrix.postScale(-1f, 1f)
            }
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.setRotate(90f)
            ExifInterface.ORIENTATION_TRANSVERSE -> {
                matrix.setRotate(270f)
                matrix.postScale(-1f, 1f)
            }
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.setRotate(270f)
        }

        return if (matrix.isIdentity) {
            bitmap
        } else {
            Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
        }
    }
}

class AndroidImageCompressor(
    private val activity: Activity? = null,
    private val codec: AndroidImageCodec = DefaultAndroidImageCodec(),
    private val dispatcher: CoroutineDispatcher = Dispatchers.Default,
) {
    suspend fun compressionThreadName(): String {
        return withContext(dispatcher) { Thread.currentThread().name }
    }

    suspend fun compressFinal(args: CompressImageArgs): AndroidCompressionResult {
        return withContext(dispatcher) {
            val outDir = args.outputDir ?: throw IllegalStateException("outputDir is required for compressFinal")
            Log.i(
                TAG,
                "[ANDROID] [IMAGE-PIPELINE:COMPRESS_REQUEST] compress_requested sourcePath=${args.sourcePath} outputDir=$outDir previewOutputDir=${args.previewOutputDir ?: outDir} originalFilename=${args.originalFilename} maxLongEdge=${args.maxLongEdge} previewMaxLongEdge=${args.previewMaxLongEdge}",
            )
            val sourceFile = File(args.sourcePath)
            val plan = buildFinalCompressionPlan(
                apiLevel = args.apiLevel ?: Build.VERSION.SDK_INT,
                maxLongEdge = args.maxLongEdge,
            )

            val decoded = decodeAndOrient(sourceFile)
            val sized = resizeIfNeeded(decoded.bitmap, plan.maxLongEdge)
            val bytes = codec.encode(sized, plan.format, plan.quality)
            val contentHash = sha256(bytes)
            val outputFile = File(outDir, "$contentHash.webp")
            outputFile.parentFile?.mkdirs()
            outputFile.writeBytes(bytes)

            val previewResult = if (args.previewMaxLongEdge > 0) {
                generatePreviewInternal(
                    sourceFile = sourceFile,
                    previewOutputDir = File(args.previewOutputDir ?: outDir),
                    previewMaxLongEdge = args.previewMaxLongEdge,
                )
            } else {
                AndroidPreviewResult(previewPath = null, previewMimeType = "image/jpeg")
            }

            AndroidCompressionResult(
                assetPath = outputFile.absolutePath,
                previewPath = previewResult.previewPath,
                contentHash = contentHash,
                contentType = plan.contentType,
                width = sized.width,
                height = sized.height,
                byteSize = bytes.size.toLong(),
                originalFilename = args.originalFilename,
            )
                .also { result ->
                    Log.i(
                        TAG,
                        "[ANDROID] [IMAGE-PIPELINE:COMPRESS_DONE] compress_done assetPath=${result.assetPath} previewPath=${result.previewPath ?: "<none>"} contentHash=${result.contentHash} contentType=${result.contentType} byteSize=${result.byteSize} width=${result.width} height=${result.height}",
                    )
                }
        }
    }

    suspend fun generatePreview(args: CompressImageArgs): AndroidPreviewResult {
        return withContext(dispatcher) {
            val previewDir = args.previewOutputDir ?: args.outputDir ?: throw IllegalStateException("previewOutputDir or outputDir is required for generatePreview")
            Log.i(
                TAG,
                "[ANDROID] [IMAGE-PIPELINE:PREVIEW_GENERATE_REQUEST] generate_preview_requested sourcePath=${args.sourcePath} previewOutputDir=$previewDir originalFilename=${args.originalFilename} previewMaxLongEdge=${args.previewMaxLongEdge}",
            )
            generatePreviewInternal(
                sourceFile = File(args.sourcePath),
                previewOutputDir = File(previewDir),
                previewMaxLongEdge = args.previewMaxLongEdge,
            ).also { result ->
                Log.i(
                    TAG,
                    "[ANDROID] [IMAGE-PIPELINE:PREVIEW_GENERATE_DONE] preview_generated previewPath=${result.previewPath ?: "<none>"} previewMimeType=${result.previewMimeType}",
                )
            }
        }
    }

    private fun generatePreviewInternal(
        sourceFile: File,
        previewOutputDir: File,
        previewMaxLongEdge: Int,
    ): AndroidPreviewResult {
        if (previewMaxLongEdge <= 0) {
            return AndroidPreviewResult(previewPath = null, previewMimeType = "image/jpeg")
        }

        val decoded = decodeAndOrient(sourceFile)
        val previewPlan = buildPreviewCompressionPlan(previewMaxLongEdge)
        val sized = resizeIfNeeded(decoded.bitmap, previewPlan.maxLongEdge)
        val previewBytes = codec.encode(sized, previewPlan.format, previewPlan.quality)
        val previewHash = sha256(previewBytes)
        val previewFile = File(previewOutputDir, "$previewHash.jpg")
        previewFile.parentFile?.mkdirs()
        previewFile.writeBytes(previewBytes)
        Log.i(
            TAG,
            "[ANDROID] [IMAGE-PIPELINE:PREVIEW_FILE_WRITTEN] preview_written previewPath=${previewFile.absolutePath} previewBytes=${previewBytes.size} previewMaxLongEdge=$previewMaxLongEdge",
        )

        return AndroidPreviewResult(
            previewPath = previewFile.absolutePath,
            previewMimeType = previewPlan.contentType,
        )
    }

    private fun decodeAndOrient(sourceFile: File): DecodedBitmap {
        val bitmap = codec.decode(sourceFile)
        val orientation = codec.readOrientation(sourceFile)
        val oriented = codec.orient(bitmap, orientation)
        return DecodedBitmap(oriented, oriented.width, oriented.height)
    }

    private fun resizeIfNeeded(bitmap: Bitmap, maxLongEdge: Int): Bitmap {
        val size = calculateTargetSize(bitmap.width, bitmap.height, maxLongEdge)
        if (size.width == bitmap.width && size.height == bitmap.height) {
            return bitmap
        }
        return Bitmap.createScaledBitmap(bitmap, size.width, size.height, true)
    }

    private fun sha256(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        return digest.joinToString(separator = "") { byte -> "%02x".format(byte) }
    }

    private data class DecodedBitmap(
        val bitmap: Bitmap,
        val width: Int,
        val height: Int,
    )
}

/**
 * Copy the bytes from a content:// URI into a cache-local file.
 *
 * Mirrors the ContentResolver staging pattern from the tauri-plugin-android-fs
 * reference. The caller is responsible for opening the input stream via
 * [android.content.ContentResolver.openInputStream].
 *
 * @param sourceUri   The content:// URI string returned by the picker (for logging).
 * @param outputFile  Destination file inside plugin cache.
 * @param openStream  Provider that opens the URI's byte stream.
 * @return The populated output file.
 * @throws FileNotFoundException if [openStream] returns null.
 * @throws IllegalStateException if output parent directory cannot be created.
 */
fun stagePickedUri(
    sourceUri: String,
    outputFile: File,
    openStream: () -> java.io.InputStream?,
): File {
    Log.i(
        TAG,
        "[ANDROID] [IMAGE-PIPELINE:PICKER_STAGE_REQUEST] stage_picker_uri_requested sourceUri=$sourceUri outputFile=${outputFile.absolutePath}",
    )

    if (!outputFile.parentFile?.isDirectory!! && !outputFile.parentFile!!.mkdirs()) {
        throw IllegalStateException(
            "Failed to create staging directory: ${outputFile.parentFile!!.absolutePath}",
        )
    }

    val input = openStream()
        ?: throw FileNotFoundException("Unable to open picker content URI: $sourceUri")

    input.use { inputStream ->
        outputFile.outputStream().use { output ->
            inputStream.copyTo(output)
        }
    }

    Log.i(
        TAG,
        "[ANDROID] [IMAGE-PIPELINE:PICKER_STAGE_DONE] stage_picker_uri_done outputFile=${outputFile.absolutePath} byteSize=${outputFile.length()}",
    )

    return outputFile
}

@TauriPlugin
class ImagePipelinePlugin(private val activity: Activity) : Plugin(activity) {
    private val compressor = AndroidImageCompressor(activity)

    @Command
    fun compressImage(invoke: Invoke) {
        val args = invoke.parseArgs(CompressImageArgs::class.java)
        CoroutineScope(Dispatchers.Default).launch {
            try {
                val result = compressor.compressFinal(args)
                invoke.resolveObject(
                    mapOf(
                        "assetPath" to result.assetPath,
                        "previewPath" to result.previewPath,
                        "contentHash" to result.contentHash,
                        "contentType" to result.contentType,
                        "width" to result.width,
                        "height" to result.height,
                        "byteSize" to result.byteSize,
                        "originalFilename" to result.originalFilename,
                    ),
                )
            } catch (error: Exception) {
                invoke.reject(error.message ?: "Android compression failed")
            }
        }
    }

    @Command
    fun generatePreview(invoke: Invoke) {
        val args = invoke.parseArgs(CompressImageArgs::class.java)
        CoroutineScope(Dispatchers.Default).launch {
            try {
                val result = compressor.generatePreview(args)
                invoke.resolveObject(
                    mapOf(
                        "previewPath" to result.previewPath,
                        "previewMimeType" to result.previewMimeType,
                    ),
                )
            } catch (error: Exception) {
                invoke.reject(error.message ?: "Android preview generation failed")
            }
        }
    }

    /**
     * Stage a picker result as a preview file in the plugin cache.
     * Called from [pickImage] to write the preview before returning.
     */
    private suspend fun stagePickerPreview(
        sourceFile: File,
        outputDir: File,
        originalFilename: String,
        previewMaxLongEdge: Int,
    ): String {
        return withContext(Dispatchers.Default) {
            outputDir.mkdirs()
            Log.i(
                TAG,
                "[ANDROID] [IMAGE-PIPELINE:PICKER_PREVIEW_STAGE_REQUEST] stage_picker_preview_requested sourcePath=${sourceFile.absolutePath} outputDir=${outputDir.absolutePath} originalFilename=$originalFilename previewMaxLongEdge=$previewMaxLongEdge",
            )
            val previewResult = AndroidImageCompressor().generatePreview(
                CompressImageArgs().apply {
                    this.sourcePath = sourceFile.absolutePath
                    this.outputDir = outputDir.absolutePath
                    this.originalFilename = originalFilename
                    this.maxLongEdge = previewMaxLongEdge
                    this.previewMaxLongEdge = previewMaxLongEdge
                },
            )
            val stagedPath = previewResult.previewPath ?: sourceFile.absolutePath
            Log.i(
                TAG,
                "[ANDROID] [IMAGE-PIPELINE:PICKER_PREVIEW_STAGE_DONE] stage_picker_preview_done previewPath=$stagedPath",
            )
            stagedPath
        }
    }
}
