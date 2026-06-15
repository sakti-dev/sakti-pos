import { createSignal, Show } from "solid-js";
import { FadeIn } from "~/components/ui/fade-in";
import { Tab } from "~/components/ui/tab";
import { useOrientation } from "~/lib/use-orientation";
import { TabKategori } from "./tab-kategori";
import { TabProduk } from "./tab-produk";
import { TabVarian } from "./tab-varian";

type TabKey = "produk" | "varian" | "kategori";

export default function Katalog() {
  const isPortrait = useOrientation();
  const enable = () => !isPortrait();
  const [tab, setTab] = createSignal<TabKey>("produk");

  return (
    <div
      class="flex flex-1 flex-col overflow-hidden"
      data-ssgoi-transition="/katalog"
    >
      {/* Title */}
      <FadeIn
        class="shrink-0 px-4 pt-5 pb-3 lg:px-6"
        duration={0.35}
        enable={enable()}
        y={-8}
      >
        <h1 class="font-bold font-display text-foreground text-heading-sm">
          Katalog
        </h1>
        <p class="mt-0.5 text-body-sm text-muted-foreground">
          Kelola produk dan layanan Anda
        </p>
      </FadeIn>

      {/* Tab nav */}
      <FadeIn
        class="flex shrink-0 gap-2 border-border border-b px-4 pb-2 lg:px-6"
        delay={0.05}
        duration={0.4}
        enable={enable()}
        y={8}
      >
        <Tab active={tab() === "produk"} onClick={() => setTab("produk")}>
          Produk
        </Tab>
        <Tab active={tab() === "varian"} onClick={() => setTab("varian")}>
          Varian
        </Tab>
        <Tab active={tab() === "kategori"} onClick={() => setTab("kategori")}>
          Kategori
        </Tab>
      </FadeIn>

      {/* Tab panels */}
      <Show when={tab() === "produk"}>
        <TabProduk />
      </Show>
      <Show when={tab() === "varian"}>
        <TabVarian />
      </Show>
      <Show when={tab() === "kategori"}>
        <TabKategori />
      </Show>
    </div>
  );
}
