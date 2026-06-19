/**
 * Indonesian administrative-region seed for the onboarding location combobox.
 *
 * `timezone` is derived from the province's time zone band:
 *   - WIB  → Asia/Jakarta  (Sumatra, Java, West/Central Kalimantan)
 *   - WITA → Asia/Makassar (Bali, Nusa Tenggara, Sulawesi, East/South Kalimantan)
 *   - WIT  → Asia/Jayapura (Maluku, Papua)
 *
 * `id` is a synthetic subdistrict code (province × city × subdistrict) — stable
 * enough for the local seed. When the sync backend lands, swap this dataset for
 * the typed region list; the combobox only depends on the {@link Region} shape.
 */

export type RegionTimezone = "Asia/Jakarta" | "Asia/Makassar" | "Asia/Jayapura";

export interface Region {
  readonly id: string;
  /** "Kecamatan, Kota/Kabupaten, Provinsi" — display + search string. */
  readonly name: string;
  readonly timezone: RegionTimezone;
}

export const regions: readonly Region[] = [
  // ── WIB · DKI Jakarta ────────────────────────────────────────────
  {
    id: "31.71.01",
    name: "Danurejan, Kota Yogyakarta, D.I. Yogyakarta",
    timezone: "Asia/Jakarta",
  },
  // ── WIB · Sumatra ────────────────────────────────────────────────
  {
    id: "14.71.01",
    name: "Sengeti, Kab. Muaro Jambi, Jambi",
    timezone: "Asia/Jakarta",
  },
  {
    id: "14.71.02",
    name: "Pelayangan, Kota Jambi, Jambi",
    timezone: "Asia/Jakarta",
  },
  {
    id: "16.71.01",
    name: "Ilir Timur I, Kota Palembang, Sumatera Selatan",
    timezone: "Asia/Jakarta",
  },
  {
    id: "16.71.02",
    name: "Kemuning, Kota Palembang, Sumatera Selatan",
    timezone: "Asia/Jakarta",
  },
  {
    id: "12.71.01",
    name: "Medan Kota, Kota Medan, Sumatera Utara",
    timezone: "Asia/Jakarta",
  },
  {
    id: "12.71.02",
    name: "Medan Helvetia, Kota Medan, Sumatera Utara",
    timezone: "Asia/Jakarta",
  },
  {
    id: "13.71.01",
    name: "Padang Barat, Kota Padang, Sumatera Barat",
    timezone: "Asia/Jakarta",
  },
  {
    id: "11.01.01",
    name: "Banda Sakti, Kota Lhokseumawe, Aceh",
    timezone: "Asia/Jakarta",
  },
  {
    id: "18.71.01",
    name: "Tanjung Karang Pusat, Kota Bandar Lampung, Lampung",
    timezone: "Asia/Jakarta",
  },
  {
    id: "18.02.01",
    name: "Metro Kibang, Kab. Lampung Timur, Lampung",
    timezone: "Asia/Jakarta",
  },
  {
    id: "10.71.01",
    name: "Sukarami, Kota Palembang, Sumatera Selatan",
    timezone: "Asia/Jakarta",
  },
  // ── WIB · Banten & Jawa Barat ───────────────────────────────────
  {
    id: "36.71.01",
    name: "Tangerang, Kota Tangerang, Banten",
    timezone: "Asia/Jakarta",
  },
  {
    id: "36.04.01",
    name: "Cisauk, Kab. Tangerang, Banten",
    timezone: "Asia/Jakarta",
  },
  {
    id: "32.73.01",
    name: "Bandung Wetan, Kota Bandung, Jawa Barat",
    timezone: "Asia/Jakarta",
  },
  {
    id: "32.73.02",
    name: "Coblong, Kota Bandung, Jawa Barat",
    timezone: "Asia/Jakarta",
  },
  {
    id: "32.75.01",
    name: "Cimahi Tengah, Kota Cimahi, Jawa Barat",
    timezone: "Asia/Jakarta",
  },
  {
    id: "32.01.06",
    name: "Cibinong, Kab. Bogor, Jawa Barat",
    timezone: "Asia/Jakarta",
  },
  {
    id: "32.16.01",
    name: "Bekasi Barat, Kota Bekasi, Jawa Barat",
    timezone: "Asia/Jakarta",
  },
  {
    id: "32.77.01",
    name: "Depok, Kota Depok, Jawa Barat",
    timezone: "Asia/Jakarta",
  },
  // ── WIB · DKI Jakarta (full) ────────────────────────────────────
  {
    id: "31.71.02",
    name: "Menteng, Kota Jakarta Pusat, D.K.I. Jakarta",
    timezone: "Asia/Jakarta",
  },
  {
    id: "31.71.03",
    name: "Tanah Abang, Kota Jakarta Pusat, D.K.I. Jakarta",
    timezone: "Asia/Jakarta",
  },
  {
    id: "31.72.01",
    name: "Tebet, Kota Jakarta Selatan, D.K.I. Jakarta",
    timezone: "Asia/Jakarta",
  },
  {
    id: "31.72.02",
    name: "Kebayoran Baru, Kota Jakarta Selatan, D.K.I. Jakarta",
    timezone: "Asia/Jakarta",
  },
  {
    id: "31.73.01",
    name: "Cilincing, Kota Jakarta Utara, D.K.I. Jakarta",
    timezone: "Asia/Jakarta",
  },
  {
    id: "31.74.01",
    name: "Cengkareng, Kota Jakarta Barat, D.K.I. Jakarta",
    timezone: "Asia/Jakarta",
  },
  {
    id: "31.75.01",
    name: "Jatinegara, Kota Jakarta Timur, D.K.I. Jakarta",
    timezone: "Asia/Jakarta",
  },
  // ── WIB · Jawa Tengah & D.I. Yogyakarta ─────────────────────────
  {
    id: "33.74.01",
    name: "Semarang Tengah, Kota Semarang, Jawa Tengah",
    timezone: "Asia/Jakarta",
  },
  {
    id: "33.74.02",
    name: "Gajahmungkur, Kota Semarang, Jawa Tengah",
    timezone: "Asia/Jakarta",
  },
  {
    id: "33.75.01",
    name: "Magelang Tengah, Kota Magelang, Jawa Tengah",
    timezone: "Asia/Jakarta",
  },
  {
    id: "33.76.01",
    name: "Pekalongan Utara, Kota Pekalongan, Jawa Tengah",
    timezone: "Asia/Jakarta",
  },
  {
    id: "33.77.01",
    name: "Tegal Selatan, Kota Tegal, Jawa Tengah",
    timezone: "Asia/Jakarta",
  },
  {
    id: "33.78.01",
    name: "Surabaya, Kota Surakarta (Solo), Jawa Tengah",
    timezone: "Asia/Jakarta",
  },
  {
    id: "33.72.01",
    name: "Banjarsari, Kota Surakarta, Jawa Tengah",
    timezone: "Asia/Jakarta",
  },
  {
    id: "34.71.01",
    name: "Gondokusuman, Kota Yogyakarta, D.I. Yogyakarta",
    timezone: "Asia/Jakarta",
  },
  {
    id: "34.71.02",
    name: "Kotagede, Kota Yogyakarta, D.I. Yogyakarta",
    timezone: "Asia/Jakarta",
  },
  {
    id: "34.02.01",
    name: "Sleman, Kab. Sleman, D.I. Yogyakarta",
    timezone: "Asia/Jakarta",
  },
  {
    id: "34.04.01",
    name: "Bantul, Kab. Bantul, D.I. Yogyakarta",
    timezone: "Asia/Jakarta",
  },
  // ── WIB · Jawa Timur ────────────────────────────────────────────
  {
    id: "35.78.01",
    name: "Tegalsari, Kota Surabaya, Jawa Timur",
    timezone: "Asia/Jakarta",
  },
  {
    id: "35.78.02",
    name: "Gubeng, Kota Surabaya, Jawa Timur",
    timezone: "Asia/Jakarta",
  },
  {
    id: "35.73.01",
    name: "Klojen, Kota Malang, Jawa Timur",
    timezone: "Asia/Jakarta",
  },
  {
    id: "35.73.02",
    name: "Lowokwaru, Kota Malang, Jawa Timur",
    timezone: "Asia/Jakarta",
  },
  {
    id: "35.71.01",
    name: "Tandes, Kota Surabaya, Jawa Timur",
    timezone: "Asia/Jakarta",
  },
  {
    id: "35.76.01",
    name: "Sidoarjo, Kab. Sidoarjo, Jawa Timur",
    timezone: "Asia/Jakarta",
  },
  {
    id: "35.74.01",
    name: "Madiun Kota, Kota Madiun, Jawa Timur",
    timezone: "Asia/Jakarta",
  },
  {
    id: "35.75.01",
    name: "Kedoko, Kota Kediri, Jawa Timur",
    timezone: "Asia/Jakarta",
  },
  // ── WIB · Kalimantan Barat/Tengah ───────────────────────────────
  {
    id: "61.71.01",
    name: "Pontianak Kota, Kota Pontianak, Kalimantan Barat",
    timezone: "Asia/Jakarta",
  },
  {
    id: "62.71.01",
    name: "Banjarmasin Utara, Kota Banjarmasin, Kalimantan Selatan",
    timezone: "Asia/Jakarta",
  },
  {
    id: "62.01.06",
    name: "Banjarbaru Utara, Kota Banjarbaru, Kalimantan Selatan",
    timezone: "Asia/Jakarta",
  },
  {
    id: "62.05.04",
    name: "Kapuas, Kab. Kapuas, Kalimantan Tengah",
    timezone: "Asia/Jakarta",
  },
  // ── WITA · Bali ─────────────────────────────────────────────────
  {
    id: "51.71.01",
    name: "Denpasar Selatan, Kota Denpasar, Bali",
    timezone: "Asia/Makassar",
  },
  {
    id: "51.71.02",
    name: "Denpasar Utara, Kota Denpasar, Bali",
    timezone: "Asia/Makassar",
  },
  {
    id: "51.71.03",
    name: "Denpasar Barat, Kota Denpasar, Bali",
    timezone: "Asia/Makassar",
  },
  {
    id: "51.02.03",
    name: "Kuta, Kab. Badung, Bali",
    timezone: "Asia/Makassar",
  },
  {
    id: "51.04.02",
    name: "Gianyar, Kab. Gianyar, Bali",
    timezone: "Asia/Makassar",
  },
  {
    id: "51.07.02",
    name: "Buleleng, Kab. Buleleng, Bali",
    timezone: "Asia/Makassar",
  },
  // ── WITA · Nusa Tenggara ────────────────────────────────────────
  {
    id: "52.01.01",
    name: "Cakranegara, Kota Mataram, Nusa Tenggara Barat",
    timezone: "Asia/Makassar",
  },
  {
    id: "52.71.01",
    name: "Selaparang, Kota Mataram, Nusa Tenggara Barat",
    timezone: "Asia/Makassar",
  },
  {
    id: "53.71.01",
    name: "Kupang Tengah, Kota Kupang, Nusa Tenggara Timur",
    timezone: "Asia/Makassar",
  },
  // ── WITA · Kalimantan Timur & Utara ─────────────────────────────
  {
    id: "64.71.01",
    name: "Samarinda Ulu, Kota Samarinda, Kalimantan Timur",
    timezone: "Asia/Makassar",
  },
  {
    id: "64.71.02",
    name: "Samarinda Ilir, Kota Samarinda, Kalimantan Timur",
    timezone: "Asia/Makassar",
  },
  {
    id: "64.72.01",
    name: "Balikpapan Kota, Kota Balikpapan, Kalimantan Timur",
    timezone: "Asia/Makassar",
  },
  {
    id: "65.71.01",
    name: "Tarakan Tengah, Kota Tarakan, Kalimantan Utara",
    timezone: "Asia/Makassar",
  },
  // ── WITA · Sulawesi ─────────────────────────────────────────────
  {
    id: "73.71.01",
    name: "Mariso, Kota Makassar, Sulawesi Selatan",
    timezone: "Asia/Makassar",
  },
  {
    id: "73.71.02",
    name: "Tamalate, Kota Makassar, Sulawesi Selatan",
    timezone: "Asia/Makassar",
  },
  {
    id: "73.71.03",
    name: "Ujung Pandang, Kota Makassar, Sulawesi Selatan",
    timezone: "Asia/Makassar",
  },
  {
    id: "73.08.02",
    name: "Pangkajene, Kab. Pangkajene dan Kepulauan, Sulawesi Selatan",
    timezone: "Asia/Makassar",
  },
  {
    id: "72.71.01",
    name: "Palu Selatan, Kota Palu, Sulawesi Tengah",
    timezone: "Asia/Makassar",
  },
  {
    id: "75.71.01",
    name: "Kota Barat, Kota Gorontalo, Gorontalo",
    timezone: "Asia/Makassar",
  },
  {
    id: "71.71.01",
    name: "Malalayang, Kota Manado, Sulawesi Utara",
    timezone: "Asia/Makassar",
  },
  {
    id: "71.71.02",
    name: "Wenang, Kota Manado, Sulawesi Utara",
    timezone: "Asia/Makassar",
  },
  {
    id: "74.71.01",
    name: "Poleang, Kota Kendari, Sulawesi Tenggara",
    timezone: "Asia/Makassar",
  },
  {
    id: "76.02.05",
    name: "Mamuju, Kab. Mamuju, Sulawesi Barat",
    timezone: "Asia/Makassar",
  },
  // ── WIT · Maluku & Papua ────────────────────────────────────────
  {
    id: "81.71.01",
    name: "Sirimau, Kota Ambon, Maluku",
    timezone: "Asia/Jayapura",
  },
  {
    id: "81.02.01",
    name: "Maluku Tengah, Kab. Maluku Tengah, Maluku",
    timezone: "Asia/Jayapura",
  },
  {
    id: "81.71.02",
    name: "Teluk Ambon, Kota Ambon, Maluku",
    timezone: "Asia/Jayapura",
  },
  {
    id: "82.71.01",
    name: "Ternate Tengah, Kota Ternate, Maluku Utara",
    timezone: "Asia/Jayapura",
  },
  {
    id: "91.01.01",
    name: "Jayapura Utara, Kota Jayapura, Papua",
    timezone: "Asia/Jayapura",
  },
  {
    id: "91.01.02",
    name: "Abepura, Kota Jayapura, Papua",
    timezone: "Asia/Jayapura",
  },
  {
    id: "92.01.01",
    name: "Sentani, Kab. Jayapura, Papua",
    timezone: "Asia/Jayapura",
  },
] as const;

export const DEFAULT_TIMEZONE: RegionTimezone = "Asia/Jakarta";

/** Substring filter (case-insensitive) across the full display name. */
export function filterRegions(query: string): readonly Region[] {
  const q = query.trim().toLowerCase();
  if (q.length < 3) {
    return [];
  }
  return regions.filter((r) => r.name.toLowerCase().includes(q));
}
