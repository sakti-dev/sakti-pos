import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker";
import { authRoutes } from "./routes/auth";
import { merchantsRoutes } from "./routes/merchants";
import { outletsRoutes } from "./routes/outlets";
import { registersRoutes } from "./routes/registers";
import { syncRoutes } from "./routes/sync";

export default new Elysia({ adapter: CloudflareAdapter })
	.use(
		cors({
			origin: true,
			credentials: true,
			methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
			allowedHeaders: ["Content-Type", "Authorization"],
			maxAge: 86400,
		}),
	)
	.onRequest(({ request }) => {
		console.log(
			`[${new Date().toISOString()}] ${request.method} ${request.url} origin=${request.headers.get("origin") ?? "none"}`,
		);
	})
	.onAfterResponse(({ request, set }) => {
		console.log(
			`[${new Date().toISOString()}] ${request.method} ${new URL(request.url).pathname} -> ${set.status}`,
		);
	})
	.onError(({ code, error, request }) => {
		console.error(
			`[${new Date().toISOString()}] ERROR ${request.method} ${new URL(request.url).pathname} code=${code}`,
			error.message,
			error.stack,
		);
	})
	.use(authRoutes)
	.use(merchantsRoutes)
	.use(outletsRoutes)
	.use(registersRoutes)
	.use(syncRoutes)
	.get("/", () => "Sakti POS API v1")
	.compile();
