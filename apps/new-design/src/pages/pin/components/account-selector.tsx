import { AnimatePresence, motion } from "motion-solidjs";
import { For, Show } from "solid-js";
import { UsersIcon } from "~/assets";
import { type PinUser, SAMPLE_USERS } from "../types";

interface AccountSelectorProps {
  readonly onCancel: () => void;
  readonly onSelect: (user: PinUser) => void;
  readonly open: boolean;
}

const EASE = [0.22, 1, 0.36, 1] as const;

export function AccountSelector(props: AccountSelectorProps) {
  return (
    <AnimatePresence>
      <Show when={props.open}>
        <motion.div
          animate={{ opacity: 1 }}
          class="fixed inset-0 z-[1000] flex items-center justify-center bg-background p-6"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE }}
        >
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            class="flex w-full max-w-[500px] flex-col gap-6"
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.22, ease: EASE }}
          >
            <div class="flex flex-col items-center gap-2">
              <div class="font-bold font-display text-foreground text-heading-sm tracking-[-0.02em]">
                Pilih Akun
              </div>
              <div class="font-medium text-body-sm text-faint-foreground">
                Siapa yang akan menggunakan perangkat ini?
              </div>
            </div>

            <div class="grid grid-cols-3 gap-3 max-[480px]:grid-cols-2">
              <For each={SAMPLE_USERS}>
                {(user, i) => (
                  <button
                    aria-label={`${user.name}, ${user.role}`}
                    class="flex animate-stagger-in flex-col items-center gap-2.5 rounded-lg border-[1.5px] border-border bg-card px-3 py-6 transition-[border-color,background,transform,box-shadow] duration-200 hover:border-accent hover:bg-accent-soft hover:shadow-card active:scale-[0.97]"
                    onClick={() => props.onSelect(user)}
                    style={{ "animation-delay": `${i() * 0.08}s` }}
                    type="button"
                  >
                    <div class="grid h-[52px] w-[52px] place-items-center rounded-full border-2 border-accent/20 bg-accent-soft font-display font-extrabold text-body-lg text-primary">
                      {user.initials}
                    </div>
                    <div class="text-center font-display font-semibold text-body-sm text-foreground">
                      {user.name}
                    </div>
                    <div class="font-medium text-caption text-faint-foreground">
                      {user.role}
                    </div>
                  </button>
                )}
              </For>
            </div>

            <div class="text-center">
              <button
                aria-label="Batal"
                class="flex items-center gap-1.5 rounded-full border border-transparent bg-transparent px-5 py-2.5 font-medium text-body-sm text-faint-foreground transition-[background,color,border-color] duration-150 hover:border-border hover:bg-primary/5 hover:text-foreground"
                onClick={props.onCancel}
                type="button"
              >
                <UsersIcon class="h-[15px] w-[15px]" />
                Batal
              </button>
            </div>
          </motion.div>
        </motion.div>
      </Show>
    </AnimatePresence>
  );
}
