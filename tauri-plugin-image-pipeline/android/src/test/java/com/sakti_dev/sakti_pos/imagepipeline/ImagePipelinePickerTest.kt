package com.sakti_dev.sakti_pos.imagepipeline

import android.graphics.Bitmap
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import kotlinx.coroutines.runBlocking
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileNotFoundException

/**
 * Tests for the Android picker backend.
 *
 * These verify preview staging, background compression, error handling,
 * and URI staging using the existing AndroidImageCompressor and
 * compression plan infrastructure.
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
        val stagingDir = createTempDir(prefix = "image-pipeline-staging")
        val previewOutDir = createTempDir(prefix = "image-pipeline-staged")
        try {
            val sourceFile = File(stagingDir, "source.jpg").apply {
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
                    outputDir = previewOutDir.absolutePath
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
            previewOutDir.deleteRecursively()
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
            codec = object : AndroidImageCodec {
                override fun decode(sourceFile: File): Bitmap =
                    throw RuntimeException("bad image")
                override fun readOrientation(sourceFile: File): Int = 1
                override fun encode(bitmap: Bitmap, format: Bitmap.CompressFormat, quality: Int): ByteArray =
                    ByteArray(8)
                override fun orient(bitmap: Bitmap, orientation: Int): Bitmap = bitmap
            },
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
            codec = object : AndroidImageCodec {
                override fun decode(sourceFile: File): Bitmap =
                    Bitmap.createBitmap(10, 10, Bitmap.Config.ARGB_8888)
                override fun readOrientation(sourceFile: File): Int = 1
                override fun encode(bitmap: Bitmap, format: Bitmap.CompressFormat, quality: Int): ByteArray =
                    throw RuntimeException("encoder crash")
                override fun orient(bitmap: Bitmap, orientation: Int): Bitmap = bitmap
            },
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

// ── URI staging ───────────────────────────────────────────────

/**
 * Tests for [stagePickedUri], which copies content:// URIs
 * into plugin cache before preview or compression.
 */
class ImagePipelineUriStagingTest {

    @get:Rule
    val tempDir = TemporaryFolder()

    private val testBytes = byteArrayOf(0x01, 0x02, 0x03, 0x7f, 0x55.toByte(), 0xff.toByte())

    @Test
    fun stagePickedUri_copiesContentUriIntoCache() {
        val outputFile = File(tempDir.root, "picked/staged.source")

        val result = stagePickedUri("content://media/external/images/media/42", outputFile) {
            ByteArrayInputStream(testBytes)
        }

        assertTrue("staged file must exist", result.exists())
        assertTrue("staged path must be absolute", result.isAbsolute)
        val pathStr = result.absolutePath
        assertTrue("path must not start with content://", !pathStr.startsWith("content://"))
        assertTrue("path must not start with file://", !pathStr.startsWith("file://"))
        assertArrayEquals("staged file must contain original bytes", testBytes, result.readBytes())
    }

    @Test
    fun stagePickedUri_createsIntermediateDirectories() {
        val outputFile = File(tempDir.root, "nested/deep/staging/source.data")

        val result = stagePickedUri("content://example/file", outputFile) {
            ByteArrayInputStream(testBytes)
        }

        assertTrue("parent dirs must be created", outputFile.parentFile!!.isDirectory)
        assertTrue("staged file must exist", result.exists())
    }

    @Test
    fun stagePickedUri_throwsWhenStreamIsNull() {
        val outputFile = File(tempDir.root, "missing.source")

        assertThrows("expected FileNotFoundException", FileNotFoundException::class.java) {
            stagePickedUri("content://missing/uri", outputFile) { null }
        }
    }

    @Test
    fun stagePickedUri_throwsOnPermissionFailure() {
        val outputFile = File(tempDir.root, "denied.source")

        assertThrows("expected SecurityException", SecurityException::class.java) {
            stagePickedUri("content://denied/uri", outputFile) {
                throw SecurityException("Permission Denial: opening provider")
            }
        }
    }

    @Test
    fun stagePickedUri_throwsOnInvalidOutputParent() {
        val outputFile = File("/proc/00000_cannot_create/staged.source")

        assertThrows("expected IllegalStateException", IllegalStateException::class.java) {
            stagePickedUri("content://media/image", outputFile) {
                ByteArrayInputStream(testBytes)
            }
        }
    }

    @Test
    fun stagePickedUri_resultIsNotContentUri() {
        val outputFile = File(tempDir.root, "final.source")

        val result = stagePickedUri("content://media/external/images/media/99", outputFile) {
            ByteArrayInputStream(testBytes)
        }

        val pathStr = result.absolutePath
        assertTrue("result must not start with content://", !pathStr.startsWith("content://"))
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

private typealias Base64 = java.util.Base64
