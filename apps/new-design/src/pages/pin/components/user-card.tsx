import type { PinUser } from "../types";

interface UserCardProps {
  readonly user: PinUser;
}

export function UserCard(props: UserCardProps) {
  return (
    <div class="flex flex-col items-center gap-3">
      <div class="relative grid h-[88px] w-[88px] animate-avatar-pulse place-items-center rounded-full border-[3px] border-accent/20 bg-accent-soft font-display font-extrabold text-heading text-primary max-[480px]:h-[76px] max-[480px]:w-[76px] max-[480px]:text-heading">
        {props.user.initials}
        <span class="absolute right-1 bottom-1 h-4 w-4 rounded-full border-[3px] border-card bg-accent" />
      </div>
      <div class="font-bold font-display text-foreground text-heading-sm tracking-[-0.02em] max-[480px]:text-heading-sm">
        {props.user.name}
      </div>
      <div class="-mt-1.5 font-medium text-body-sm text-faint-foreground tracking-[0.02em]">
        {props.user.role} · {props.user.venue}
      </div>
    </div>
  );
}
