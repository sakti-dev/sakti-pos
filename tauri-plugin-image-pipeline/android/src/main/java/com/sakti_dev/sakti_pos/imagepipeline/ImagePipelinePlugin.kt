package com.sakti_dev.sakti_pos.imagepipeline

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.os.Build
import android.util.Log
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import java.io.ByteArrayOutputStream
import java.io.File
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
    lateinit var outputDir: String
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

@InvokeArg
class AndroidStagePickerSourceArgs {
    lateinit var sourcePath: String
    lateinit var outputPath: String
    lateinit var originalFilename: String
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

data class AndroidStagePickerSourceResult(
    val stagedPath: String,
    val originalFilename: String,
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
            Log.i(
                TAG,
                "[ANDROID] [IMAGE-PIPELINE:COMPRESS_REQUEST] compress_requested sourcePath=${args.sourcePath} outputDir=${args.outputDir} previewOutputDir=${args.previewOutputDir ?: args.outputDir} originalFilename=${args.originalFilename} maxLongEdge=${args.maxLongEdge} previewMaxLongEdge=${args.previewMaxLongEdge}",
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
            val outputFile = File(args.outputDir, "$contentHash.webp")
            outputFile.parentFile?.mkdirs()
            outputFile.writeBytes(bytes)

            val previewResult = if (args.previewMaxLongEdge > 0) {
                generatePreviewInternal(
                    sourceFile = sourceFile,
                    previewOutputDir = File(args.previewOutputDir ?: args.outputDir),
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
            Log.i(
                TAG,
                "[ANDROID] [IMAGE-PIPELINE:PREVIEW_GENERATE_REQUEST] generate_preview_requested sourcePath=${args.sourcePath} outputDir=${args.outputDir} originalFilename=${args.originalFilename} previewMaxLongEdge=${args.previewMaxLongEdge}",
            )
            generatePreviewInternal(
                sourceFile = File(args.sourcePath),
                previewOutputDir = File(args.previewOutputDir ?: args.outputDir),
                previewMaxLongEdge = args.previewMaxLongEdge,
            ).also { result ->
                Log.i(
                    TAG,
                    "[ANDROID] [IMAGE-PIPELINE:PREVIEW_GENERATE_DONE] preview_generated previewPath=${result.previewPath ?: "<none>"} previewMimeType=${result.previewMimeType}",
                )
            }
        }
    }

    suspend fun stagePickerSource(args: AndroidStagePickerSourceArgs): AndroidStagePickerSourceResult {
        return withContext(dispatcher) {
            Log.i(
                TAG,
                "[ANDROID] [IMAGE-PIPELINE:PICKER_STAGE_REQUEST] stage_picker_source_requested sourcePath=${args.sourcePath} outputPath=${args.outputPath} originalFilename=${args.originalFilename}",
            )
            val outputFile = File(args.outputPath)
            val parentDir = outputFile.parentFile
                ?: throw IllegalStateException("Picker staging output path has no parent")
            parentDir.mkdirs()

            if (args.sourcePath.startsWith("content://")) {
                val resolver = activity?.contentResolver
                    ?: throw IllegalStateException("Android activity unavailable for picker staging")
                Log.i(
                    TAG,
                    "[ANDROID] [IMAGE-PIPELINE:PICKER_STAGE_READ_START] stage_picker_source_read_start uri=${args.sourcePath}",
                )
                val inputStream = resolver.openInputStream(Uri.parse(args.sourcePath))
                    ?: throw IllegalArgumentException("Unable to open picker content URI")
                inputStream.use { input ->
                    outputFile.outputStream().use { output ->
                        input.copyTo(output)
                    }
                }
            } else {
                Log.i(
                    TAG,
                    "[ANDROID] [IMAGE-PIPELINE:PICKER_STAGE_READ_START] stage_picker_source_read_start uri=${args.sourcePath}",
                )
                File(args.sourcePath).inputStream().use { input ->
                    outputFile.outputStream().use { output ->
                        input.copyTo(output)
                    }
                }
            }

            Log.i(
                TAG,
                "[ANDROID] [IMAGE-PIPELINE:PICKER_STAGE_DONE] stage_picker_source_done stagedPath=${outputFile.absolutePath}",
            )
            AndroidStagePickerSourceResult(
                stagedPath = outputFile.absolutePath,
                originalFilename = args.originalFilename,
            )
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

    @Command
    fun stagePickerSource(invoke: Invoke) {
        val args = invoke.parseArgs(AndroidStagePickerSourceArgs::class.java)
        CoroutineScope(Dispatchers.Default).launch {
            try {
                val result = compressor.stagePickerSource(args)
                invoke.resolveObject(
                    mapOf(
                        "stagedPath" to result.stagedPath,
                        "originalFilename" to result.originalFilename,
                    ),
                )
            } catch (error: Exception) {
                Log.e(
                    TAG,
                    "[ANDROID] [IMAGE-PIPELINE:PICKER_STAGE_FAILED] stage_picker_source_failed error=${error::class.java.name}: ${error.message}",
                    error,
                )
                invoke.reject(
                    "${error::class.java.simpleName}: ${error.message ?: "Android picker staging failed"}\n${error.stackTraceToString()}",
                )
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
