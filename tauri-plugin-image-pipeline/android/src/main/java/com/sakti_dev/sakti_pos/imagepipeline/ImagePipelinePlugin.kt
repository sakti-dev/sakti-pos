package com.sakti_dev.sakti_pos.imagepipeline

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.os.Build
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
    private val codec: AndroidImageCodec = DefaultAndroidImageCodec(),
    private val dispatcher: CoroutineDispatcher = Dispatchers.Default,
) {
    suspend fun compressionThreadName(): String {
        return withContext(dispatcher) { Thread.currentThread().name }
    }

    suspend fun compressFinal(args: CompressImageArgs): AndroidCompressionResult {
        return withContext(dispatcher) {
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
        }
    }

    suspend fun generatePreview(args: CompressImageArgs): AndroidPreviewResult {
        return withContext(dispatcher) {
            generatePreviewInternal(
                sourceFile = File(args.sourcePath),
                previewOutputDir = File(args.previewOutputDir ?: args.outputDir),
                previewMaxLongEdge = args.previewMaxLongEdge,
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
    private val compressor = AndroidImageCompressor()

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
}
