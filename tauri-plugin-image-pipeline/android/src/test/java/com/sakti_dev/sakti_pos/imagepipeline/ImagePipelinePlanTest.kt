package com.sakti_dev.sakti_pos.imagepipeline

import android.graphics.Bitmap
import org.junit.Assert.assertEquals
import org.junit.Test

class ImagePipelineCompressorTest {
    @Test
    fun finalAssetPlanUsesLegacyWebpBeforeApi30() {
        val plan = buildFinalCompressionPlan(apiLevel = 29, maxLongEdge = 400)

        assertEquals(Bitmap.CompressFormat.WEBP, plan.format)
        assertEquals(75, plan.quality)
        assertEquals("image/webp", plan.contentType)
    }

    @Test
    fun finalAssetPlanUsesLossyWebpOnApi30AndNewer() {
        val plan = buildFinalCompressionPlan(apiLevel = 30, maxLongEdge = 400)

        assertEquals(Bitmap.CompressFormat.WEBP_LOSSY, plan.format)
        assertEquals(75, plan.quality)
        assertEquals("image/webp", plan.contentType)
    }

    @Test
    fun previewPlanUsesJpegAtQuality75() {
        val plan = buildPreviewCompressionPlan(maxLongEdge = 320)

        assertEquals(Bitmap.CompressFormat.JPEG, plan.format)
        assertEquals(75, plan.quality)
        assertEquals("image/jpeg", plan.contentType)
    }

    @Test
    fun targetSizingPreservesAspectRatioWithoutUpscaling() {
        assertEquals(TargetSize(800, 600), calculateTargetSize(800, 600, 1200))
        assertEquals(TargetSize(400, 300), calculateTargetSize(800, 600, 400))
    }
}
