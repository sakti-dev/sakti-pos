import { createSignal } from "solid-js";

/**
 * Device pairing state for the router gate: does this device hold a cloud
 * session token? Owned by AuthStorage writes (and the provider's mount
 * read) so it updates the moment a token appears or disappears — a
 * mount-time snapshot goes stale on fresh installs where login happens
 * after mount, sending an authenticated user back to the email screen.
 *
 * undefined = not yet known (gate holds off redirecting).
 */
const [paired, setPaired] = createSignal<boolean | undefined>(undefined);

export { paired };

export function markPaired(hasToken: boolean): void {
  setPaired(hasToken);
}
