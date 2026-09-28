package com.sakti_dev.sakti_pos.qris

import org.junit.Assert.assertEquals
import org.junit.Test

class PaymentEventStoreTest {

    private fun event(postTime: Long) = CapturedPaymentEvent(
        packageName = "com.example.bank",
        appLabel = "Example Bank",
        amountRupiah = 15000L,
        rawText = "Dana masuk Rp15.000",
        postTimeMillis = postTime,
    )

    @Test
    fun appendKeepsInsertionOrder() {
        val result = PaymentEventStore.append(
            listOf(event(1)),
            event(2),
        )
        assertEquals(listOf(1L, 2L), result.map { it.postTimeMillis })
    }

    @Test
    fun appendCapsAtCapacityDroppingOldest() {
        var events = (1..PaymentEventStore.CAPACITY).map { event(it.toLong()) }
        events = PaymentEventStore.append(events, event(999))
        assertEquals(PaymentEventStore.CAPACITY, events.size)
        assertEquals(999L, events.last().postTimeMillis)
        assertEquals(2L, events.first().postTimeMillis)
    }
}
