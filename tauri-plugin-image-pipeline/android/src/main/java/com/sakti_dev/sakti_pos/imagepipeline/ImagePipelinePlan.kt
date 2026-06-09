package com.sakti_dev.sakti_pos.imagepipeline

import android.graphics.Bitmap

data class TargetSize(
    val width: Int,
    val height: Int,
)

data class CompressionPlan(
    val format: Bitmap.CompressFormat,
    val quality: Int,
    val contentType: String,
    val maxLongEdge: Int,
)

private const val DEFAULT_QUALITY = 75
private const val DEFAULT_PREVIEW_QUALITY = 75

fun calculateTargetSize(originalWidth: Int, originalHeight: Int, maxLongEdge: Int): TargetSize {
    if (originalWidth <= 0 || originalHeight <= 0 || maxLongEdge <= 0) {
        return TargetSize(0, 0)
    }

    val longEdge = maxOf(originalWidth, originalHeight)
    if (longEdge <= maxLongEdge) {
        return TargetSize(originalWidth, originalHeight)
    }

    val ratio = maxLongEdge.toDouble() / longEdge.toDouble()
    val width = (originalWidth * ratio).toInt().coerceAtLeast(1)
    val height = (originalHeight * ratio).toInt().coerceAtLeast(1)
    return TargetSize(width, height)
}

fun buildFinalCompressionPlan(apiLevel: Int, maxLongEdge: Int): CompressionPlan {
    val format = if (apiLevel >= 30) {
        Bitmap.CompressFormat.WEBP_LOSSY
    } else {
        Bitmap.CompressFormat.WEBP
    }

    return CompressionPlan(
        format = format,
        quality = DEFAULT_QUALITY,
        contentType = "image/webp",
        maxLongEdge = maxLongEdge,
    )
}

fun buildPreviewCompressionPlan(maxLongEdge: Int): CompressionPlan {
    return CompressionPlan(
        format = Bitmap.CompressFormat.JPEG,
        quality = DEFAULT_PREVIEW_QUALITY,
        contentType = "image/jpeg",
        maxLongEdge = maxLongEdge,
    )
}
