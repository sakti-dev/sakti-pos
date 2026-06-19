import type { PinUser } from "./types";

interface UserCardProps {
  readonly user: PinUser;
}

export function UserCard(props: UserCardProps) {
  return (
    <div class="flex flex-col items-center gap-3">
      <div class="relative grid h-[76px] w-[76px] animate-avatar-pulse place-items-center rounded-full border-4 border-accent/20 bg-accent-soft font-display font-extrabold text-heading text-primary sm:h-[88px] sm:w-[88px] sm:text-heading">
        {props.user.initials}
        <span class="absolute right-1 bottom-1 h-4 w-4 rounded-full border-4 border-card bg-accent" />
      </div>
      <div class="font-bold font-display text-foreground text-heading-sm tracking-tight sm:text-heading-sm">
        {props.user.name}
      </div>
      <div class="-mt-1.5 font-medium text-body-sm text-faint-foreground tracking-wide">
        {props.user.role} · {props.user.venue}
      </div>
    </div>
  );
}
