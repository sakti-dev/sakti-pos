import { eq } from "drizzle-orm";
import { db, TABLE } from "./index";

export async function getMerchantById(
  merchantId: string
): Promise<{ id: string; name: string } | undefined> {
  const [row] = await db
    .select({ id: TABLE.merchants.id, name: TABLE.merchants.name })
    .from(TABLE.merchants)
    .where(eq(TABLE.merchants.id, merchantId))
    .limit(1);

  return row;
}
