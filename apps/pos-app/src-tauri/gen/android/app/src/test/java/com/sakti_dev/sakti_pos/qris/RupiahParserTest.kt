package com.sakti_dev.sakti_pos.qris

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RupiahParserTest {

    @Test
    fun parsesThousandsSeparatorWithoutCents() {
        assertEquals(15000L, RupiahParser.parseRupiah("QRIS BCA/DARI BUDI/Rp15.000/28/09 14:32/WOIQRIS"))
    }

    @Test
    fun parsesWithLeadingSpace() {
        assertEquals(15000L, RupiahParser.parseRupiah("Dana masuk Rp 15.000 dari BUDI"))
    }

    @Test
    fun parsesWithDotAfterMarker() {
        assertEquals(25000L, RupiahParser.parseRupiah("Transaksi QRIS Rp.25.000 berhasil"))
    }

    @Test
    fun parsesBareDigits() {
        assertEquals(15000L, RupiahParser.parseRupiah("Pembayaran Rp15000 berhasil"))
    }

    @Test
    fun dropsTrailingCentsGroupInsteadOfAppending() {
        assertEquals(15000L, RupiahParser.parseRupiah("Rp15.000,00"))
        assertEquals(15000L, RupiahParser.parseRupiah("Rp15.000.00"))
    }

    @Test
    fun parsesLargeAmountsWithCents() {
        assertEquals(1500000L, RupiahParser.parseRupiah("Rp1.500.000,00 masuk"))
    }

    @Test
    fun assemblesAllNotificationStyleVariants() {
        val assembled = RupiahParser.assembleNotificationText(
            title = "BCA",
            text = "QRIS masuk",
            bigText = "QRIS BCA/DARI BUDI/Rp15.000,00/28/09 14:32",
            textLines = listOf(),
        )
        assertEquals(15000L, RupiahParser.parseRupiah(assembled))
    }

    @Test
    fun parsesAmountThatOnlyExistsInBigText() {
        val assembled = RupiahParser.assembleNotificationText(
            title = "Livin' by BRI",
            text = "Kamu menerima uang",
            bigText = "",
            textLines = listOf("Dana masuk", "Rp37.500", "dari WARUNG MAKAN"),
        )
        assertEquals(37500L, RupiahParser.parseRupiah(assembled))
    }

    @Test
    fun parsesSmallAmountWithoutSeparator() {
        assertEquals(500L, RupiahParser.parseRupiah("Rp500"))
        assertEquals(500L, RupiahParser.parseRupiah("Rp 500"))
        assertEquals(500L, RupiahParser.parseRupiah("Rp.500"))
        assertEquals(500L, RupiahParser.parseRupiah("QRIS masuk Rp 500 dari pembeli"))
    }

    @Test
    fun parsesLowercaseMarker() {
        assertEquals(5000L, RupiahParser.parseRupiah("rp5.000 diterima"))
    }

    @Test
    fun firstMarkerWinsWhenSaldoFollows() {
        assertEquals(15000L, RupiahParser.parseRupiah("Pembayaran Rp15.000 diterima. Saldo Rp485.000"))
    }

    @Test
    fun returnsNullWithoutCurrencyMarker() {
        assertNull(RupiahParser.parseRupiah("Kode OTP 123456 jangan dibagikan"))
        assertNull(RupiahParser.parseRupiah("No reff 8899776"))
        assertNull(RupiahParser.parseRupiah("Transfer ke 081234567890 berhasil"))
        assertNull(RupiahParser.parseRupiah("Pesanan #1234 sedang diproses"))
    }

    @Test
    fun returnsNullOnEmptyOrBlankText() {
        assertNull(RupiahParser.parseRupiah(""))
        assertNull(RupiahParser.parseRupiah("   "))
    }

    @Test
    fun normalizeHandlesCommaThousandsLikeDots() {
        assertEquals(15000L, RupiahParser.normalizeGroupsToRupiah("15,000"))
        assertEquals(250L, RupiahParser.normalizeGroupsToRupiah("250"))
    }
}
