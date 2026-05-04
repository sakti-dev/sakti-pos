import { describe, expect, test } from "vitest";
import { cn, formatIDR } from "../utils";

describe("cn", () => {
	test("merges class names", () => {
		expect(cn("foo", "bar")).toBe("foo bar");
	});

	test("handles conditional classes", () => {
		expect(cn("base", false, "active")).toBe("base active");
	});

	test("deduplicates tailwind classes", () => {
		expect(cn("px-2", "px-4")).toBe("px-4");
	});
});

describe("formatIDR", () => {
	test("formats zero", () => {
		expect(formatIDR(0)).toBe("Rp\u00a00");
	});

	test("formats positive amount", () => {
		expect(formatIDR(15_000)).toBe("Rp\u00a015.000");
	});

	test("formats large amount", () => {
		expect(formatIDR(1_500_000)).toBe("Rp\u00a01.500.000");
	});
});
