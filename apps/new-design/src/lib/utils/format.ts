const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Format a number as Rupiah.
 *
 * @example fmtRupiah(68_000) → "Rp 68.000"
 * @example fmtRupiah(68_000, { prefix: false }) → "68.000"
 */
export const formatRupiah = (
  n: number,
  { prefix = true }: { prefix?: boolean } = {}
): string => {
  const s = rupiah.format(n);
  return prefix ? s : s.replace("Rp", "").trimStart();
};

/**
 * Format an array of item names, truncating with "+N lagi" when long.
 *
 * @example formatItems(["A", "B", "C", "D"]) → "A, B +2 lagi"
 */
export const formatItems = (items: readonly string[]): string => {
  if (items.length > 2) {
    return `${items.slice(0, 2).join(", ")} +${items.length - 2} lagi`;
  }
  return items.join(", ");
};
