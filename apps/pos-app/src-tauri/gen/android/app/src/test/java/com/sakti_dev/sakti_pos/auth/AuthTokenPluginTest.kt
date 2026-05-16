package com.sakti_dev.sakti_pos.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AuthTokenPluginTest {
    @Test
    fun tokenRecordRoundTripsThroughSharedPreferenceValue() {
        val record = EncryptedTokenRecord(
            ivBase64 = "aXY=",
            ciphertextBase64 = "Y2lwaGVy",
        )

        val serialized = record.toPreferenceValue()

        assertEquals(record, EncryptedTokenRecord.fromPreferenceValue(serialized))
    }

    @Test
    fun malformedPreferenceValueReturnsNull() {
        assertNull(EncryptedTokenRecord.fromPreferenceValue("not-json"))
        assertNull(EncryptedTokenRecord.fromPreferenceValue("""{"iv":"missing"}"""))
    }

    @Test
    fun emptyTokenIsRejectedBeforeEncryption() {
        val result = validateTokenForStorage("")

        assertEquals("Token cannot be empty", result)
    }
}
