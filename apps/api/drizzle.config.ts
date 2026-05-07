import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	dialect: "sqlite",
	schema: path.resolve(__dirname, "../../packages/database/src/api-schema.ts"),
	out: "./drizzle",
	dbCredentials: {
		url: process.env.TURSO_DATABASE_URL ?? "http://127.0.0.1:8080",
		authToken: process.env.TURSO_AUTH_TOKEN,
	},
});
