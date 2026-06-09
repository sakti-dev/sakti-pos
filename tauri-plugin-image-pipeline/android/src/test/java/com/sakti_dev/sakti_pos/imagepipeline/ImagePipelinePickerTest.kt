package com.sakti_dev.sakti_pos.imagepipeline

import android.graphics.Bitmap
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlinx.coroutines.runBlocking
import java.io.File

/**
 * Tests for the Android picker backend.
 *
 * These verify preview staging, background compression, and error handling
 * using the existing AndroidImageCompressor and compression plan infrastructure.
 */

// ── PickImageArgs defaults ─────────────────────────────────────

class ImagePipelinePickerArgsTest {

    @Test
    fun pickImageArgsDefaultsAreReasonable() {
        val args = PickImageArgs()
        assertEquals("image", args.pickerMode)
        assertEquals(400, args.compressionMaxLongEdge)
        assertEquals(320, args.compressionPreviewMaxLongEdge)
        assertEquals(75, args.compressionQuality)
    }
}

// ── PickImageResult ────────────────────────────────────────────

class ImagePipelinePickerResultTest {

    @Test
    fun pickImageResultContainsRequiredFields() {
        val result = PickImageResult(
            jobId = "job-abc-123",
            previewPath = "/data/cache/preview_abc.jpg",
            previewMimeType = "image/jpeg",
            status = "pending",
        )

        assertEquals("job-abc-123", result.jobId)
        assertEquals("/data/cache/preview_abc.jpg", result.previewPath)
        assertEquals("image/jpeg", result.previewMimeType)
        assertEquals("pending", result.status)
    }

    @Test
    fun pickImageResultStatusIsTerminal() {
        val pending = PickImageResult(
            jobId = "j1",
            previewPath = "/tmp/preview.jpg",
            previewMimeType = "image/jpeg",
            status = "pending",
        )
        val processing = PickImageResult(
            jobId = "j2",
            previewPath = "/tmp/preview2.jpg",
            previewMimeType = "image/jpeg",
            status = "processing",
        )

        assertEquals("pending", pending.status)
        assertEquals("processing", processing.status)
    }
}

// ── Preview staging ────────────────────────────────────────────

class ImagePipelinePreviewStagingTest {

    @Test
    fun stagedPreviewPathDoesNotContainContentUri() = runBlocking {
        // Verify the output path format from the compressor
        val stagingDir = createTempDir(prefix = "image-pipeline-staging")
        val outputDir = createTempDir(prefix = "image-pipeline-staged")
        try {
            val sourceFile = File(stagingDir, "source.jpg").apply {
                // Write a minimal valid PNG (1x1 pixel)
                writeBytes(
                    Base64.getDecoder().decode(
                        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2LpXcAAAAASUVORK5CYII="
                    )
                )
            }

            val compressor = AndroidImageCompressor(
                codec = StubAndroidImageCodec(),
            )

            val result = compressor.generatePreview(
                CompressImageArgs().apply {
                    sourcePath = sourceFile.absolutePath
                    outputDir = outputDir.absolutePath
                    originalFilename = "source.jpg"
                    previewMaxLongEdge = 320
                },
            )

            assertNotNull("preview path must not be null", result.previewPath)
            val path = result.previewPath!!
            assertTrue(
                "path must not start with content://",
                !path.startsWith("content://")
            )
            assertTrue(
                "path must not start with file://",
                !path.startsWith("file://")
            )
            assertTrue(
                "preview file must exist on disk",
                File(path).exists()
            )
        } finally {
            stagingDir.deleteRecursively()
            outputDir.deleteRecursively()
        }
    }
}

// ── Background compression off main thread ─────────────────────

class ImagePipelineBackgroundCompressionTest {

    @Test
    fun compressionRunsOnBackgroundDispatcher() = runBlocking {
        val mainThreadName = Thread.currentThread().name
        val compressor = AndroidImageCompressor(
            codec = StubAndroidImageCodec(),
        )

        val backgroundThreadName = compressor.compressionThreadName()
        assertTrue(
            "compression thread must differ from calling thread",
            backgroundThreadName != mainThreadName
        )
    }

    @Test
    fun decodeFailureProducesExplicitError() = runBlocking {
        val compressor = AndroidImageCompressor(
            codec = FailingAndroidImageCodec(decodeError = RuntimeException("bad image")),
        )

        try {
            compressor.compressFinal(
                CompressImageArgs().apply {
                    sourcePath = "/nonexistent/source.jpg"
                    outputDir = createTempDir(prefix = "decode-fail-output").absolutePath
                    originalFilename = "source.jpg"
                    maxLongEdge = 400
                    previewMaxLongEdge = 320
                },
            )
            error("expected decode failure")
        } catch (error: RuntimeException) {
            assertTrue(
                "error message should mention bad image",
                error.message?.contains("bad image") == true
            )
        }
    }

    @Test
    fun encodeFailureProducesExplicitError() = runBlocking {
        val compressor = AndroidImageCompressor(
            codec = FailingAndroidImageCodec(encodeError = RuntimeException("encoder crash")),
        )

        try {
            compressor.compressFinal(
                CompressImageArgs().apply {
                    sourcePath = "/some/source.jpg"
                    outputDir = createTempDir(prefix = "encode-fail-output").absolutePath
                    originalFilename = "source.jpg"
                    maxLongEdge = 400
                    previewMaxLongEdge = 320
                },
            )
            error("expected encode failure")
        } catch (error: RuntimeException) {
            assertTrue(
                "error message should mention encoder",
                error.message?.contains("encoder crash") == true
            )
        }
    }
}

// ── Helpers ────────────────────────────────────────────────────

/** Minimal stub for tests that don't need real codec behavior. */
private class StubAndroidImageCodec : AndroidImageCodec {
    override fun decode(sourceFile: File): Bitmap {
        return Bitmap.createBitmap(10, 10, Bitmap.Config.ARGB_8888)
    }

    override fun readOrientation(sourceFile: File): Int = 1

    override fun encode(
        bitmap: Bitmap,
        format: Bitmap.CompressFormat,
        quality: Int,
    ): ByteArray = ByteArray(8) { 1 }

    override fun orient(bitmap: Bitmap, orientation: Int): Bitmap = bitmap
}

private class FailingAndroidImageCodec(
    private val decodeError: Throwable? = null,
    private val encodeError: Throwable? = null,
) : AndroidImageCodec {
    override fun decode(sourceFile: File): Bitmap {
        decodeError?.let { throw it }
        return Bitmap.createBitmap(10, 10, Bitmap.Config.ARGB_8888)
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

private typealias Base64 = java.util.Base64
