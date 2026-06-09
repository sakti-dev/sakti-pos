package com.sakti_dev.sakti_pos.imagepipeline

import android.graphics.Bitmap
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.security.MessageDigest

@RunWith(AndroidJUnit4::class)
class ImagePipelineCompressorFailureInstrumentedTest {
    @Test
    fun encodeFailureIsExplicitAndWritesNothing() {
        val sourceDir = createTempDir(prefix = "image-pipeline-encode-source")
        val outputDir = createTempDir(prefix = "image-pipeline-encode-output")
        val source = File(sourceDir, "source.jpg").apply {
            Bitmap.createBitmap(2, 2, Bitmap.Config.ARGB_8888).compress(
                Bitmap.CompressFormat.JPEG,
                90,
                outputStream(),
            )
        }

        val compressor = AndroidImageCompressor(
            codec = object : AndroidImageCodec {
                override fun decode(sourceFile: File): Bitmap {
                    return Bitmap.createBitmap(2, 2, Bitmap.Config.ARGB_8888)
                }

                override fun readOrientation(sourceFile: File): Int = 1

                override fun encode(
                    bitmap: Bitmap,
                    format: Bitmap.CompressFormat,
                    quality: Int,
                ): ByteArray {
                    throw IllegalStateException("encode failed")
                }

                override fun orient(bitmap: Bitmap, orientation: Int): Bitmap = bitmap
            },
        )

        try {
            runCatching {
                kotlinx.coroutines.runBlocking {
                    compressor.compressFinal(
                        CompressImageArgs().apply {
                            sourcePath = source.absolutePath
                            this.outputDir = outputDir.absolutePath
                            originalFilename = "source.jpg"
                            maxLongEdge = 400
                            previewMaxLongEdge = 320
                        },
                    )
                }
            }.getOrThrow()
            error("expected encode failure")
        } catch (error: IllegalStateException) {
            assertTrue(error.message?.contains("encode failed") == true)
            assertTrue(outputDir.listFiles().orEmpty().isEmpty())
        }
    }

    @Test
    fun contentHashComesFromEncodedBytes() {
        val sourceDir = createTempDir(prefix = "image-pipeline-hash-source")
        val outputDir = createTempDir(prefix = "image-pipeline-hash-output")
        val source = File(sourceDir, "source.jpg").apply {
            Bitmap.createBitmap(2, 2, Bitmap.Config.ARGB_8888).compress(
                Bitmap.CompressFormat.JPEG,
                90,
                outputStream(),
            )
        }
        val encodedBytes = byteArrayOf(9, 8, 7, 6)
        val expectedHash = MessageDigest.getInstance("SHA-256")
            .digest(encodedBytes)
            .joinToString(separator = "") { byte -> "%02x".format(byte) }

        val compressor = AndroidImageCompressor(
            codec = object : AndroidImageCodec {
                override fun decode(sourceFile: File): Bitmap {
                    return Bitmap.createBitmap(2, 2, Bitmap.Config.ARGB_8888)
                }

                override fun readOrientation(sourceFile: File): Int = 1

                override fun encode(
                    bitmap: Bitmap,
                    format: Bitmap.CompressFormat,
                    quality: Int,
                ): ByteArray {
                    return encodedBytes
                }

                override fun orient(bitmap: Bitmap, orientation: Int): Bitmap = bitmap
            },
        )

        val result = kotlinx.coroutines.runBlocking {
            compressor.compressFinal(
                CompressImageArgs().apply {
                    sourcePath = source.absolutePath
                    this.outputDir = outputDir.absolutePath
                    originalFilename = "source.jpg"
                    maxLongEdge = 400
                    previewMaxLongEdge = 0
                },
            )
        }

        assertTrue(result.contentHash == expectedHash)
        assertTrue(File(result.assetPath).exists())
        assertTrue(outputDir.listFiles().orEmpty().isNotEmpty())
    }
}
