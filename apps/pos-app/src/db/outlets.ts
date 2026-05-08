import { outlets } from "@repo/database";
import { eq } from "drizzle-orm";
import { currentMerchantId } from "~/store/outlet";
import { db } from "./index";

export async function getAllOutlets(): Promise<{ id: string; name: string }[]> {
	const merchantId = currentMerchantId();
	if (!merchantId) return [];
	const rows = await db
		.select({ id: outlets.id, name: outlets.name })
		.from(outlets)
		.where(eq(outlets.merchantId, merchantId));
	return rows;
}
