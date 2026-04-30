import { describe, expect, test } from "bun:test"
import { formatIDR } from "./utils"

describe("formatIDR", () => {
  test("formats zero", () => {
    expect(formatIDR(0)).toBe("Rp0")
  })

  test("formats positive amount", () => {
    expect(formatIDR(15000)).toBe("Rp15.000")
  })

  test("formats large amount", () => {
    expect(formatIDR(1500000)).toBe("Rp1.500.000")
  })
})
