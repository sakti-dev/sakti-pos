import { Elysia } from "elysia";
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker";
import { authRoutes } from "./routes/auth";
import { merchantsRoutes } from "./routes/merchants";
import { outletsRoutes } from "./routes/outlets";
import { registersRoutes } from "./routes/registers";
import { syncRoutes } from "./routes/sync";

const ALLOWED_ORIGINS = [
	"http://localhost:1420",
	"http://localhost:5173",
	"http://localhost:4173",
	"http://127.0.0.1:1420",
	"http://127.0.0.1:5173",
	"http://127.0.0.1:4173",
	"tauri://localhost",
	"https://tauri.localhost",
];

function corsHeaders(
	request: Request,
	set: { headers: Record<string, unknown> },
) {
	const origin = request.headers.get("origin") ?? "";
	const allowed = ALLOWED_ORIGINS.includes(origin);

	if (allowed) {
		set.headers["Access-Control-Allow-Origin"] = origin;
	}

	set.headers["Access-Control-Allow-Methods"] =
		"GET, POST, PUT, DELETE, OPTIONS";
	set.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
	set.headers["Access-Control-Allow-Credentials"] = "true";
	set.headers["Access-Control-Max-Age"] = "86400";
}

const cors = new Elysia({ name: "cors" })
	.onBeforeHandle(({ request, set }) => corsHeaders(request, set))
	.options("/*", ({ request, set }) => {
		corsHeaders(request, set);
		return new Response(null, { status: 204 });
	});

export default new Elysia({ adapter: CloudflareAdapter })
	.use(cors)
	.use(authRoutes)
	.use(merchantsRoutes)
	.use(outletsRoutes)
	.use(registersRoutes)
	.use(syncRoutes)
	.get("/", () => "Sakti POS API v1")
	.compile();
