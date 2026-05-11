import { merchants } from "@repo/database";
import { eq } from "drizzle-orm";
import { db } from "./index";

export async function getMerchantById(
  merchantId: string
): Promise<{ id: string; name: string } | undefined> {
  const [row] = await db
    .select({ id: merchants.id, name: merchants.name })
    .from(merchants)
    .where(eq(merchants.id, merchantId))
    .limit(1);

  return row;
}
