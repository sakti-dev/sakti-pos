import * as schema from "@repo/database";
import { invoke } from "@tauri-apps/api/core";
import { drizzle } from "drizzle-orm/sqlite-proxy";

interface SqlRow {
	columns: string[];
	values: unknown[];
}

export const db = drizzle(
	async (sql, params, method) => {
		try {
			const rows = await invoke<SqlRow[]>("run_sql", {
				query: { sql, params, method },
			});

			if (rows.length === 0 && method === "get") {
				return {} as { rows: unknown[] };
			}

			return method === "get"
				? { rows: rows[0]?.values ?? [] }
				: { rows: rows.map((r) => r.values) };
		} catch (err) {
			console.error(
				"[auth] DB query failed:",
				sql,
				"params:",
				JSON.stringify(params),
				"error:",
				err,
			);
			throw err;
		}
	},
	{ schema },
);

export type DatabaseType = typeof db;
