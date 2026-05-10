import { describe, expect, test } from "vitest";
import * as v from "valibot";

import {
	CloudLoginSchema,
	CloudRegisterSchema,
} from "../cloud-login-form";

describe("cloud auth schemas", () => {
	test("accepts login payload", () => {
		const result = v.safeParse(CloudLoginSchema, {
			email: "user@example.com",
			password: "password1234",
		});

		expect(result.success).toBe(true);
	});

	test("accepts register payload", () => {
		const result = v.safeParse(CloudRegisterSchema, {
			name: "Nama",
			email: "user@example.com",
			password: "password1234",
		});

		expect(result.success).toBe(true);
	});
});
