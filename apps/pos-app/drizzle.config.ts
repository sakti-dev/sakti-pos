import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	schema: "../../packages/database/src/local-schema.ts",
	out: "./drizzle",
});
