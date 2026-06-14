import { FadeIn } from "~/components/ui/fade-in";
import { useOrientation } from "~/lib/use-orientation";

export default function Katalog() {
  const isPortrait = useOrientation();
  const enable = () => !isPortrait();

  return (
    <div
      class="scrollbar-none flex flex-1 flex-col gap-4 overflow-y-auto px-[18px] pt-6 pb-28 lg:gap-5 lg:px-7 lg:pb-24"
      data-ssgoi-transition="/katalog"
    >
      <FadeIn duration={0.35} enable={enable()} y={-8}>
        <h1 class="font-bold font-display text-foreground text-heading-sm">
          Katalog
        </h1>
        <p class="mt-0.5 text-body-sm text-muted-foreground tracking-[0.02em]">
          Kelola produk dan layanan Anda
        </p>
      </FadeIn>

      <FadeIn delay={0.1} duration={0.45} enable={enable()} y={20}>
        <div class="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-border border-dashed py-20 text-center">
          <div class="font-medium text-body-sm text-muted-foreground">
            Coming soon
          </div>
          <div class="text-caption text-faint-foreground">
            Halaman katalog belum tersedia
          </div>
        </div>
      </FadeIn>
    </div>
  );
}
