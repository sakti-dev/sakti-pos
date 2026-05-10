import * as v from "valibot";

export const ProductSchema = v.object({
	name: v.pipe(
		v.string("Nama produk wajib diisi"),
		v.nonEmpty("Nama produk wajib diisi"),
	),
	categoryId: v.pipe(
		v.string("Kategori wajib dipilih"),
		v.nonEmpty("Kategori wajib dipilih"),
	),
	price: v.pipe(
		v.string("Harga wajib diisi"),
		v.nonEmpty("Harga wajib diisi"),
		v.transform((input) => Number(input)),
		v.number("Harga harus berupa angka"),
		v.finite("Harga harus berupa angka"),
		v.integer("Harga harus bilangan bulat"),
		v.minValue(0, "Harga tidak boleh negatif"),
	),
	imageUrl: v.union([
		v.literal(""),
		v.pipe(v.string(), v.url("URL gambar tidak valid")),
	]),
});

export type ProductFormValues = v.InferOutput<typeof ProductSchema>;
