import { AnimatePresence, motion } from "motion-solidjs";
import { createSignal, For } from "solid-js";
import { GridDetailIcon, GridIcon, LayersIcon, PlusIcon } from "~/assets";

const EASE = [0.22, 1, 0.36, 1] as const;

interface SpeedDialAction {
  readonly href: string;
  readonly Icon: typeof PlusIcon;
  readonly label: string;
}

const actions: readonly SpeedDialAction[] = [
  { Icon: GridDetailIcon, href: "/catalog/product/new", label: "Produk Baru" },
  { Icon: LayersIcon, href: "/catalog/variant/new", label: "Varian Baru" },
  { Icon: GridIcon, href: "/catalog/category/new", label: "Kategori Baru" },
] as const;

export function SpeedDialFab() {
  const [open, setOpen] = createSignal(false);

  return (
    <div class="fixed right-5 bottom-6 z-50 flex flex-col items-end gap-3 sm:hidden">
      <AnimatePresence>
        {open() && (
          <>
            {/* Backdrop */}
            <motion.div
              animate={{ opacity: 1 }}
              class="fixed inset-0 -z-10 bg-background/60 backdrop-blur-[2px]"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              transition={{ duration: 0.2, ease: EASE }}
            />

            {/* Action items */}
            <For each={actions}>
              {(action, i) => (
                <motion.a
                  animate={{
                    opacity: 1,
                    scale: 1,
                    y: 0,
                    transition: {
                      delay: (actions.length - 1 - i()) * 0.04,
                      duration: 0.2,
                      ease: EASE,
                    },
                  }}
                  class="flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pr-1.5 pl-4 shadow-card-hover"
                  exit={{
                    opacity: 0,
                    scale: 0.6,
                    y: 8,
                    transition: { duration: 0.15, ease: EASE },
                  }}
                  href={action.href}
                  initial={{ opacity: 0, scale: 0.6, y: 8 }}
                >
                  <span class="whitespace-nowrap font-semibold text-body-sm text-foreground">
                    {action.label}
                  </span>
                  <span class="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground">
                    <action.Icon class="h-4 w-4" />
                  </span>
                </motion.a>
              )}
            </For>
          </>
        )}
      </AnimatePresence>

      {/* FAB toggle */}
      <motion.button
        animate={{ rotate: open() ? 45 : 0 }}
        aria-label={open() ? "Tutup menu" : "Tambah item"}
        class="relative grid h-14 w-14 place-items-center overflow-hidden rounded-full p-[2px] shadow-card"
        onClick={() => setOpen((v) => !v)}
        transition={{ duration: 0.2, ease: EASE }}
        whileTap={{ scale: 0.9 }}
      >
        {/* Rotating gradient ring */}
        <span class="absolute inset-[-1000%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,var(--color-accent)_0%,var(--color-primary)_50%,var(--color-accent)_100%)]" />
        {/* Content */}
        <span class="relative grid h-full w-full place-items-center rounded-full bg-primary text-primary-foreground">
          <PlusIcon class="h-6 w-6" />
        </span>
      </motion.button>
    </div>
  );
}
