import { syncCursors, syncOutbox } from "@repo/database";
import { describe, expect, test } from "vitest";

describe("local smart sync schema", () => {
	test("defines compact outbox and cursor tables", () => {
		expect(syncOutbox).toBeDefined();
		expect(syncCursors).toBeDefined();
	});
});
