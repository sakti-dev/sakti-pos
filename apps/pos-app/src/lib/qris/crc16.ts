/**
 * CRC16-CCITT (false variant) checksum for EMVCo QR / QRIS payloads.
 * Polynomial 0x1021, init 0xFFFF, no reflection, no final XOR.
 *
 * Ported from verssache/qris-dinamis (MIT License, (c) 2020) with modifications.
 */

export function calculateCRC16(str: string): string {
  let crc = 0xff_ff;

  for (let i = 0; i < str.length; i++) {
    // biome-ignore lint/suspicious/noBitwiseOperators: CRC16 is defined in bit arithmetic; there is no non-bitwise form.
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      // biome-ignore lint/suspicious/noBitwiseOperators: CRC16 is defined in bit arithmetic; there is no non-bitwise form.
      if (crc & 0x80_00) {
        // biome-ignore lint/suspicious/noBitwiseOperators: CRC16 is defined in bit arithmetic; there is no non-bitwise form.
        crc = ((crc << 1) ^ 0x10_21) & 0xff_ff;
      } else {
        // biome-ignore lint/suspicious/noBitwiseOperators: CRC16 is defined in bit arithmetic; there is no non-bitwise form.
        crc = (crc << 1) & 0xff_ff;
      }
    }
  }

  // biome-ignore lint/suspicious/noBitwiseOperators: CRC16 is defined in bit arithmetic; there is no non-bitwise form.
  return (crc & 0xff_ff).toString(16).toUpperCase().padStart(4, "0");
}
