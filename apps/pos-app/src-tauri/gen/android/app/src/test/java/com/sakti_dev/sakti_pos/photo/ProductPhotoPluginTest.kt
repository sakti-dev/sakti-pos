package com.sakti_dev.sakti_pos.photo

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProductPhotoPluginTest {
    @Test
    fun startupCleanupDoesNotDeleteProductPhotoInputs() {
        assertFalse(
            isStartupDeletableTempPhotoPath(
                "/data/user/0/com.sakti_dev.sakti_pos/cache/product_photo_inputs/gallery_1.jpg"
            )
        )
    }

    @Test
    fun startupCleanupCanDeleteTransientFiles() {
        assertTrue(
            isStartupDeletableTempPhotoPath(
                "/data/user/0/com.sakti_dev.sakti_pos/cache/product_photo_transient/photo_1.jpg"
            )
        )
    }
}
