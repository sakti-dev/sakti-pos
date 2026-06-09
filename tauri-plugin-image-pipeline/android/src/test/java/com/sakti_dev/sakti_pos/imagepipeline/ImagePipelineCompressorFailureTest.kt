package com.sakti_dev.sakti_pos.imagepipeline

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlinx.coroutines.newSingleThreadContext
import kotlinx.coroutines.runBlocking
import java.io.File
import java.util.Base64

private class FailingAndroidImageCodec(
    private val decodeError: Throwable? = null,
    private val encodeError: Throwable? = null,
) : AndroidImageCodec {
    override fun decode(sourceFile: File): Bitmap {
        decodeError?.let { throw it }
        val png = Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2LpXcAAAAASUVORK5CYII=",
        )
        return BitmapFactory.decodeByteArray(png, 0, png.size)
            ?: error("failed to build test bitmap")
    }

    override fun readOrientation(sourceFile: File): Int = 1

    override fun encode(
        bitmap: Bitmap,
        format: Bitmap.CompressFormat,
        quality: Int,
    ): ByteArray {
        encodeError?.let { throw it }
        return ByteArray(8) { 1 }
    }

    override fun orient(bitmap: Bitmap, orientation: Int): Bitmap = bitmap
}

class ImagePipelineCompressorFailureTest {
    @Test
    fun decodeFailureIsExplicitAndWritesNothing() = runBlocking {
        val sourceDir = createTempDir(prefix = "image-pipeline-decode-source")
        val outputDir = createTempDir(prefix = "image-pipeline-decode-output")
        val source = File(sourceDir, "source.jpg").apply { writeText("not-an-image") }

        val compressor = AndroidImageCompressor(
            codec = FailingAndroidImageCodec(decodeError = IllegalArgumentException("decode failed")),
        )

        try {
            compressor.compressFinal(
                CompressImageArgs().apply {
                    sourcePath = source.absolutePath
                    this.outputDir = outputDir.absolutePath
                    originalFilename = "source.jpg"
                    maxLongEdge = 400
                    previewMaxLongEdge = 320
                },
            )
            error("expected decode failure")
        } catch (error: IllegalArgumentException) {
            assertTrue(error.message?.contains("decode failed") == true)
            assertTrue(outputDir.listFiles().orEmpty().isEmpty())
        }
    }

    @Test
    fun compressionWorkRunsOnInjectedBackgroundDispatcher() = runBlocking {
        val currentThreadName = Thread.currentThread().name
        val workerDispatcher = newSingleThreadContext("image-pipeline-worker")
        try {
            val compressor = AndroidImageCompressor(
                codec = FailingAndroidImageCodec(),
                dispatcher = workerDispatcher,
            )

            val workerThreadName = compressor.compressionThreadName()
            assertNotEquals(currentThreadName, workerThreadName)
            assertTrue(workerThreadName.contains("image-pipeline-worker"))
        } finally {
            workerDispatcher.close()
        }
    }
}
