import dayjs from "dayjs";
import { eq } from "drizzle-orm";
import { getSyncClient } from "~/lib/sync";
import { currentMerchantId } from "~/store/outlet";
import { db, TABLE } from "./index";
import { getMerchantById } from "./merchants";

interface OutletRecord {
  address: string | null;
  id: string;
  merchantId: string;
  name: string;
  receiptAddress: string | null;
  receiptName: string | null;
  timezone: string;
}

export async function getAllOutlets(): Promise<
  { id: string; name: string; timezone: string }[]
> {
  const merchantId = currentMerchantId();
  if (!merchantId) {
    return [];
  }
  const rows = await db
    .select({
      id: TABLE.outlets.id,
      name: TABLE.outlets.name,
      timezone: TABLE.outlets.timezone,
    })
    .from(TABLE.outlets)
    .where(eq(TABLE.outlets.merchantId, merchantId));
  return rows;
}

export async function getOutletById(
  outletId: string
): Promise<OutletRecord | undefined> {
  const [row] = await db
    .select({
      address: TABLE.outlets.address,
      id: TABLE.outlets.id,
      merchantId: TABLE.outlets.merchantId,
      name: TABLE.outlets.name,
      receiptAddress: TABLE.outlets.receiptAddress,
      receiptName: TABLE.outlets.receiptName,
      timezone: TABLE.outlets.timezone,
    })
    .from(TABLE.outlets)
    .where(eq(TABLE.outlets.id, outletId))
    .limit(1);
  return row;
}

export async function getOutletReceiptHeader(
  outletId: string
): Promise<{ address: string | null; name: string }> {
  const receiptDefaults = await getOutletReceiptDefaults(outletId);
  if (!receiptDefaults) {
    return { address: null, name: "" };
  }

  return {
    address: receiptDefaults.effectiveAddress,
    name: receiptDefaults.effectiveName,
  };
}

export async function getOutletReceiptDefaults(outletId: string): Promise<
  | {
      merchantName: string;
      effectiveAddress: string | null;
      effectiveName: string;
      outletAddress: string | null;
      outletName: string;
    }
  | undefined
> {
  const outlet = await getOutletById(outletId);
  if (!outlet) {
    return;
  }

  const merchant = await getMerchantById(outlet.merchantId);
  return {
    effectiveAddress: outlet.receiptAddress ?? outlet.address,
    effectiveName: outlet.receiptName ?? merchant?.name ?? outlet.name,
    merchantName: merchant?.name ?? outlet.name,
    outletAddress: outlet.address,
    outletName: outlet.name,
  };
}

export async function updateOutletTimezone(
  outletId: string,
  timezone: string
): Promise<{ id: string; name: string; timezone: string } | undefined> {
  const row = await getSyncClient().writeTransaction(db, async (tx) => {
    const [result] = await tx
      .update(TABLE.outlets)
      .set({ timezone, updatedAt: dayjs().toISOString(), isSynced: false })
      .where(eq(TABLE.outlets.id, outletId))
      .returning({
        id: TABLE.outlets.id,
        merchantId: TABLE.outlets.merchantId,
        name: TABLE.outlets.name,
        timezone: TABLE.outlets.timezone,
      });

    if (!result) {
      return;
    }

    await getSyncClient().enqueueChange(tx, {
      operation: "update",
      rowId: result.id,
      table: TABLE.outlets,
    });

    return result;
  });

  if (!row) {
    return;
  }

  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
  };
}

export async function saveOutletReceiptHeader(
  outletId: string,
  effectiveName: string | null,
  effectiveAddress: string | null
): Promise<
  | {
      address: string | null;
      id: string;
      merchantId: string;
      name: string;
      receiptAddress: string | null;
      receiptName: string | null;
      timezone: string;
    }
  | undefined
> {
  const row = await getSyncClient().writeTransaction(db, async (tx) => {
    const [result] = await tx
      .update(TABLE.outlets)
      .set({
        receiptAddress: effectiveAddress,
        receiptName: effectiveName,
        updatedAt: dayjs().toISOString(),
        isSynced: false,
      })
      .where(eq(TABLE.outlets.id, outletId))
      .returning({
        address: TABLE.outlets.address,
        id: TABLE.outlets.id,
        merchantId: TABLE.outlets.merchantId,
        name: TABLE.outlets.name,
        receiptAddress: TABLE.outlets.receiptAddress,
        receiptName: TABLE.outlets.receiptName,
        timezone: TABLE.outlets.timezone,
      });

    if (!result) {
      return;
    }

    await getSyncClient().enqueueChange(tx, {
      operation: "update",
      rowId: result.id,
      table: TABLE.outlets,
    });

    return result;
  });

  if (!row) {
    return;
  }

  return {
    address: row.address,
    id: row.id,
    merchantId: row.merchantId,
    name: row.name,
    receiptAddress: row.receiptAddress,
    receiptName: row.receiptName,
    timezone: row.timezone,
  };
}
