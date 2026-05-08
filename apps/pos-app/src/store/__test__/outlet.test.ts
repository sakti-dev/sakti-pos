import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	clearOutletContext,
	isDevicePaired,
	loadOutletContext,
	setOutletContext,
} from "../outlet";

describe("isDevicePaired", () => {
	beforeEach(() => {
		localStorage.clear();
	});
	afterEach(() => {
		clearOutletContext();
		localStorage.clear();
	});

	test("returns false when no outlet context exists", () => {
		expect(isDevicePaired()).toBe(false);
	});

	test("returns true when outlet context is set", () => {
		setOutletContext("outlet-1", "merchant-1");
		expect(isDevicePaired()).toBe(true);
	});

	test("returns false after clearing context", () => {
		setOutletContext("outlet-1", "merchant-1");
		clearOutletContext();
		expect(isDevicePaired()).toBe(false);
	});

	test("returns true after loading persisted context", () => {
		setOutletContext("outlet-1", "merchant-1", "register-1");
		clearOutletContext();
		localStorage.setItem("sakti-pos:current-outlet-id", "outlet-1");
		localStorage.setItem("sakti-pos:current-merchant-id", "merchant-1");
		loadOutletContext();
		expect(isDevicePaired()).toBe(true);
	});
});
