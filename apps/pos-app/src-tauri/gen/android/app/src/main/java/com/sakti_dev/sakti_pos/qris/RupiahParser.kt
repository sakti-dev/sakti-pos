package com.sakti_dev.sakti_pos.qris

/**
 * Parses a Rupiah amount from Indonesian bank/e-wallet notification text.
 * Amounts are anchored on an explicit `Rp` marker so bare numbers (reference
 * codes, phone numbers, OTPs) are never parsed as money.
 */
object RupiahParser {
    private val RUPIAH_AMOUNT_RE = Regex("""(?i)\brp\.?\s*([0-9][0-9.,]*)""")

    /**
     * Assemble the searchable text of a notification from all style variants.
     * Some bank apps put the amount only in the expanded big text or inbox
     * lines, not in the collapsed title/text pair.
     */
    fun assembleNotificationText(
        title: String,
        text: String,
        bigText: String,
        textLines: List<String>,
    ): String = listOf(title, text, bigText, textLines.joinToString("\n"))
        .filter { it.isNotBlank() }
        .joinToString(separator = "\n")

    fun parseRupiah(text: String): Long? {
        val match = RUPIAH_AMOUNT_RE.find(text) ?: return null
        return normalizeGroupsToRupiah(match.groupValues[1])
    }

    /**
     * Digit groups separated by `.` or `,`. When the final group has exactly
     * two digits it is a cents group ("Rp15.000,00" -> 15000) and is dropped;
     * otherwise all groups are thousands separators ("Rp15.000" -> 15000).
     */
    internal fun normalizeGroupsToRupiah(raw: String): Long? {
        val parts = raw.split('.', ',').filter { it.isNotEmpty() }
        if (parts.isEmpty()) {
            return null
        }
        val hasCentsGroup = parts.size > 1 && parts.last().length == 2
        val groups = if (hasCentsGroup) parts.dropLast(1) else parts
        return groups.joinToString("").toLongOrNull()
    }
}
