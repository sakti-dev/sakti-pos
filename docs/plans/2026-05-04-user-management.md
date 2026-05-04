# User Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add owner-only user management with CRUD, role assignment, PIN reset, and business rule enforcement.

**Architecture:** Nested routes under `/users` (like `/menu`). Data layer in `src/db/users.ts`. Forms follow existing `category-form.tsx`/`product-form.tsx` patterns. PIN hashing via existing `hashPin()` from `auth-provider.ts`.

**Tech Stack:** SolidJS, Drizzle ORM, @corvu/drawer, existing shared UI components.

---

### Task 1: Data Layer — `src/db/users.ts`

**Files:**
- Create: `src/db/users.ts`

**Step 1: Create the user query module**

```typescript
import { count, eq } from "drizzle-orm";
import { db } from "./index";
import { users } from "./schema";

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export async function getUsers(): Promise<User[]> {
  return await db.select().from(users).orderBy(users.name, users.id);
}

export async function getUser(id: number): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, id));
  return row;
}

export async function createUser(data: NewUser): Promise<User> {
  const [row] = await db.insert(users).values(data).returning();
  return row;
}

export async function updateUser(
  id: number,
  data: Partial<Omit<NewUser, "id">>
): Promise<User> {
  const [row] = await db
    .update(users)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(users.id, id))
    .returning();
  return row;
}

export async function countActiveOwners(): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(users)
    .where(eq(users.role, "owner"));
  return row?.count ?? 0;
}
```

**Step 2: Verify lint passes**

Run: `bun x biome check src/db/users.ts`
Expected: PASS

**Step 3: Commit**

```
👔 feat: add user data layer (src/db/users.ts)
```

---

### Task 2: User Management Wrapper + Route Refactor

**Files:**
- Create: `src/pages/users/user-management.tsx`
- Delete: `src/pages/users.tsx`
- Modify: `src/App.tsx` — nest `/users` routes, add sub-routes

**Step 1: Create the wrapper component**

File: `src/pages/users/user-management.tsx`

```typescript
import type { RouteSectionProps } from "@solidjs/router";

export default function UserManagement(props: RouteSectionProps) {
  return props.children;
}
```

**Step 2: Delete old stub**

Delete: `src/pages/users.tsx`

**Step 3: Update App.tsx routes**

Replace the `/users` route block in `src/App.tsx`:

Old (lines 16, 80-87):
```typescript
import Users from "./pages/users";
// ...
<Route
  component={() => (
    <RequireAuth roles={["owner"]}>
      <Users />
    </RequireAuth>
  )}
  path="/users"
/>
```

New:
```typescript
import UserForm from "./pages/users/user-form";
import UserList from "./pages/users/user-list";
import UserManagement from "./pages/users/user-management";
import ResetPin from "./pages/users/reset-pin";
// ...
<Route
  component={(props) => (
    <RequireAuth roles={["owner"]}>
      <UserManagement {...props} />
    </RequireAuth>
  )}
  path="/users"
>
  <Route component={UserList} path="/" />
  <Route component={UserForm} path="/add" />
  <Route component={UserForm} path="/:id/edit" />
  <Route component={ResetPin} path="/:id/reset-pin" />
</Route>
```

Remove the old `import Users from "./pages/users"` line.

**Step 4: Verify lint passes**

Run: `bun x biome check src/App.tsx src/pages/users/user-management.tsx`
Expected: PASS (user-list, user-form, reset-pin imports will error — that's OK, we'll create those next)

Note: If the import errors prevent biome from running, comment them out temporarily, or create placeholder files.

**Step 5: Commit**

```
🚧 wip: scaffold user management routes and wrapper
```

---

### Task 3: User List Page

**Files:**
- Create: `src/pages/users/user-list.tsx`

**Step 1: Create the user list page**

File: `src/pages/users/user-list.tsx`

```typescript
import { A, useNavigate } from "@solidjs/router";
import { createResource, For, Show } from "solid-js";

import { Button } from "~/components/ui/button";
import { getUsers } from "~/db/users";
import { cn } from "~/lib/utils";

const ROLE_STYLES: Record<string, string> = {
  owner: "bg-primary text-primary-foreground",
  manager: "bg-blue-600 text-white",
  cashier: "bg-muted text-muted-foreground",
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  manager: "Manajer",
  cashier: "Kasir",
};

export default function UserList() {
  const navigate = useNavigate();
  const [users, { refetch }] = createResource(getUsers);

  return (
    <>
      <div class="p-4">
        <div class="mb-4 flex items-center justify-between">
          <p class="text-muted-foreground text-sm">
            {users()?.length ?? 0} pengguna
          </p>
          <A href="/users/add">
            <Button size="sm">+ Tambah</Button>
          </A>
        </div>

        <Show
          fallback={
            <div class="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <p>Belum ada pengguna</p>
              <p class="text-sm">
                Tap "+ Tambah" untuk membuat pengguna baru
              </p>
            </div>
          }
          when={users() && users()!.length > 0}
        >
          <div class="space-y-2">
            <For each={users()}>
              {(user) => (
                <div class="flex items-center gap-3 rounded-xl border bg-card p-3">
                  <div class="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-medium text-primary-foreground">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-medium">{user.name}</p>
                    <div class="flex items-center gap-2">
                      <span
                        class={cn(
                          "rounded-full px-2 py-0.5 font-medium text-xs",
                          ROLE_STYLES[user.role] ?? ""
                        )}
                      >
                        {ROLE_LABELS[user.role] ?? user.role}
                      </span>
                      <Show when={!user.isActive}>
                        <span class="text-destructive text-xs">Nonaktif</span>
                      </Show>
                    </div>
                  </div>
                  <button
                    class="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
                    onClick={() => navigate(`/users/${user.id}/edit`)}
                    type="button"
                  >
                    ✏️
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </>
  );
}
```

**Step 2: Verify lint passes**

Run: `bun x biome check src/pages/users/user-list.tsx`
Expected: PASS

**Step 3: Commit**

```
✨ feat: add user list page with role badges and avatars
```

---

### Task 4: User Form Page (Add + Edit)

**Files:**
- Create: `src/pages/users/user-form.tsx`

This is the most complex page. Add mode: name, role, PIN + confirm. Edit mode: name, role, active toggle, link to reset PIN.

**Step 1: Create the user form page**

File: `src/pages/users/user-form.tsx`

```typescript
import { useNavigate, useParams } from "@solidjs/router";
import { createResource, createSignal, Show } from "solid-js";

import { Button } from "~/components/ui/button";
import { ConfirmDrawer } from "~/components/confirm-drawer";
import { PageHeader } from "~/components/ui/page-header";
import { Select } from "~/components/ui/select";
import { currentUser } from "~/lib/auth";
import { hashPin } from "~/lib/auth-provider";
import { countActiveOwners, createUser, getUser, updateUser } from "~/db/users";

const ROLE_OPTIONS = [
  { value: "cashier", label: "Kasir" },
  { value: "manager", label: "Manajer" },
  { value: "owner", label: "Owner" },
];

export default function UserForm() {
  const params = useParams();
  const navigate = useNavigate();
  const isEdit = () => !!params.id;
  const title = () => (isEdit() ? "Edit Pengguna" : "Tambah Pengguna");

  const [user] = createResource(
    () => (isEdit() ? Number(params.id) : undefined),
    (id) => (id === undefined ? undefined : getUser(id))
  );

  const [name, setName] = createSignal("");
  const [role, setRole] = createSignal<string | undefined>(undefined);
  const [pin, setPin] = createSignal("");
  const [confirmPin, setConfirmPin] = createSignal("");
  const [isActive, setIsActive] = createSignal(true);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");

  const [deactivateOpen, setDeactivateOpen] = createSignal(false);

  const validate = (): string | null => {
    const trimmed = name().trim();
    if (!trimmed) return "Nama wajib diisi";
    if (!role()) return "Peran wajib dipilih";
    if (!isEdit()) {
      if (pin().length < 6) return "PIN minimal 6 digit";
      if (pin() !== confirmPin()) return "PIN tidak cocok";
    }
    return null;
  };

  const checkBusinessRules = async (): Promise<string | null> => {
    const me = currentUser();
    const targetId = Number(params.id);
    const newRole = role();

    if (isEdit() && me?.id === targetId) {
      if (!isActive()) return "Tidak dapat menonaktifkan akun sendiri";
      if (newRole !== "owner") {
        const ownerCount = await countActiveOwners();
        if (ownerCount <= 1)
          return "Tidak dapat mengubah peran — Anda satu-satunya owner aktif";
      }
    }

    if (isEdit() && !isActive() && newRole === "owner") {
      const ownerCount = await countActiveOwners();
      if (ownerCount <= 1)
        return "Tidak dapat menonaktifkan — setidaknya harus ada satu owner aktif";
    }

    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (isEdit()) {
        const ruleError = await checkBusinessRules();
        if (ruleError) {
          setError(ruleError);
          setLoading(false);
          return;
        }

        await updateUser(Number(params.id), {
          name: name().trim(),
          role: role() as "owner" | "manager" | "cashier",
          isActive: isActive(),
        });
      } else {
        const hashedPin = await hashPin(pin());
        await createUser({
          name: name().trim(),
          role: role() as "owner" | "manager" | "cashier",
          pin: hashedPin,
        });
      }
      navigate("/users", { replace: true });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Gagal menyimpan pengguna"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async () => {
    setDeactivateOpen(false);
    const ruleError = await checkBusinessRules();
    if (ruleError) {
      setError(ruleError);
      return;
    }
    setIsActive(!isActive());
  };

  const canSave = () => {
    if (!name().trim() || !role() || loading()) return false;
    if (!isEdit()) {
      return pin().length >= 6 && pin() === confirmPin();
    }
    return true;
  };

  return (
    <>
      <PageHeader backHref="/users">{title()}</PageHeader>
      <div class="flex flex-1 flex-col p-4">
        <Show when={error()}>
          <div class="mb-3 rounded-lg bg-error px-3 py-2 text-error-foreground text-sm">
            {error()}
          </div>
        </Show>

        <Show
          fallback={
            <div class="flex flex-1 items-center justify-center text-muted-foreground">
              Memuat...
            </div>
          }
          when={!isEdit() || user()}
        >
          <div class="flex flex-col gap-4">
            <div>
              <label
                class="mb-1.5 block font-medium text-sm"
                for="user-name"
              >
                Nama
              </label>
              <input
                class="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring"
                id="user-name"
                onInput={(e) => setName(e.currentTarget.value)}
                placeholder="Nama pengguna"
                type="text"
                value={isEdit() ? (user()?.name ?? "") : name()}
              />
            </div>

            <div>
              <label
                class="mb-1.5 block font-medium text-sm"
                for="user-role"
              >
                Peran
              </label>
              <Select
                label="Peran"
                name="role"
                onChange={(v) => setRole(v == null ? undefined : String(v))}
                options={ROLE_OPTIONS}
                placeholder="Pilih peran"
                value={
                  role() ??
                  (isEdit() ? user()?.role : undefined) ??
                  undefined
                }
              />
            </div>

            <Show when={!isEdit()}>
              <div>
                <label
                  class="mb-1.5 block font-medium text-sm"
                  for="user-pin"
                >
                  PIN (6 digit)
                </label>
                <input
                  class="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring"
                  id="user-pin"
                  inputMode="numeric"
                  onInput={(e) => setPin(e.currentTarget.value)}
                  placeholder="Minimal 6 digit"
                  type="password"
                  value={pin()}
                />
              </div>
              <div>
                <label
                  class="mb-1.5 block font-medium text-sm"
                  for="user-confirm-pin"
                >
                  Konfirmasi PIN
                </label>
                <input
                  class="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring"
                  id="user-confirm-pin"
                  inputMode="numeric"
                  onInput={(e) => setConfirmPin(e.currentTarget.value)}
                  placeholder="Ulangi PIN"
                  type="password"
                  value={confirmPin()}
                />
              </div>
            </Show>

            <Show when={isEdit()}>
              <div class="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <p class="font-medium text-sm">Status Aktif</p>
                  <p class="text-muted-foreground text-xs">
                    {isActive()
                      ? "Pengguna dapat login"
                      : "Pengguna tidak dapat login"}
                  </p>
                </div>
                <button
                  class={cn(
                    "shrink-0 rounded-full px-2.5 py-1 font-medium text-xs",
                    isActive()
                      ? "bg-success text-success-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                  onClick={() => {
                    if (isActive()) {
                      setDeactivateOpen(true);
                    } else {
                      setIsActive(true);
                    }
                  }}
                  type="button"
                >
                  {isActive() ? "Aktif" : "Nonaktif"}
                </button>
              </div>

              <button
                class="text-primary text-sm underline"
                onClick={() =>
                  navigate(`/users/${params.id}/reset-pin`, {
                    replace: true,
                  })
                }
                type="button"
              >
                Ubah PIN
              </button>
            </Show>
          </div>
        </Show>

        <div class="mt-auto pt-4">
          <Button
            class="w-full"
            disabled={!canSave()}
            onClick={handleSave}
            size="lg"
          >
            {loading() ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </div>

      <ConfirmDrawer
        message="Nonaktifkan pengguna ini? Mereka tidak akan bisa login."
        onClose={() => setDeactivateOpen(false)}
        onConfirm={handleToggleActive}
        open={deactivateOpen()}
        title="Nonaktifkan Pengguna"
        variant="destructive"
      />
    </>
  );
}
```

**Step 2: Verify lint passes**

Run: `bun x biome check src/pages/users/user-form.tsx`
Expected: PASS

**Step 3: Commit**

```
✨ feat: add user form page (add/edit with role select, PIN, active toggle)
```

---

### Task 5: Reset PIN Page

**Files:**
- Create: `src/pages/users/reset-pin.tsx`

**Step 1: Create the reset PIN page**

File: `src/pages/users/reset-pin.tsx`

```typescript
import { useNavigate, useParams } from "@solidjs/router";
import { createSignal, Show } from "solid-js";

import { Button } from "~/components/ui/button";
import { PageHeader } from "~/components/ui/page-header";
import { changePin } from "~/lib/auth-provider";

export default function ResetPin() {
  const params = useParams();
  const navigate = useNavigate();

  const [pin, setPin] = createSignal("");
  const [confirmPin, setConfirmPin] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");

  const handleSave = async () => {
    if (pin().length < 6) {
      setError("PIN minimal 6 digit");
      return;
    }
    if (pin() !== confirmPin()) {
      setError("PIN tidak cocok");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await changePin(Number(params.id), pin());
      navigate("/users", { replace: true });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Gagal mengubah PIN"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader backHref={`/users/${params.id}/edit`}>Ubah PIN</PageHeader>
      <div class="flex flex-1 flex-col p-4">
        <Show when={error()}>
          <div class="mb-3 rounded-lg bg-error px-3 py-2 text-error-foreground text-sm">
            {error()}
          </div>
        </Show>

        <div class="flex flex-col gap-4">
          <div>
            <label
              class="mb-1.5 block font-medium text-sm"
              for="new-pin"
            >
              PIN Baru (6 digit)
            </label>
            <input
              class="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring"
              id="new-pin"
              inputMode="numeric"
              onInput={(e) => setPin(e.currentTarget.value)}
              placeholder="Minimal 6 digit"
              type="password"
              value={pin()}
            />
          </div>
          <div>
            <label
              class="mb-1.5 block font-medium text-sm"
              for="confirm-new-pin"
            >
              Konfirmasi PIN Baru
            </label>
            <input
              class="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring"
              id="confirm-new-pin"
              inputMode="numeric"
              onInput={(e) => setConfirmPin(e.currentTarget.value)}
              placeholder="Ulangi PIN baru"
              type="password"
              value={confirmPin()}
            />
          </div>
        </div>

        <div class="mt-auto pt-4">
          <Button
            class="w-full"
            disabled={
              pin().length < 6 || pin() !== confirmPin() || loading()
            }
            onClick={handleSave}
            size="lg"
          >
            {loading() ? "Menyimpan..." : "Simpan PIN"}
          </Button>
        </div>
      </div>
    </>
  );
}
```

**Step 2: Verify lint passes**

Run: `bun x biome check src/pages/users/reset-pin.tsx`
Expected: PASS

**Step 3: Commit**

```
✨ feat: add reset PIN page
```

---

### Task 6: Final Wiring + Lint Check

**Files:**
- All files from Tasks 1-5

**Step 1: Run full lint**

Run: `bun x ultracite check`
Expected: PASS on all files

**Step 2: Run tests**

Run: `bun test`
Expected: All existing tests pass

**Step 3: Manual test on device**

Run: `./dev` and test the full flow:
1. Login as owner → sidebar shows "Pengguna" link
2. Navigate to `/users` → see user list with Owner
3. Add new user (cashier) with PIN → appears in list
4. Edit user → change name, role, toggle active
5. Reset PIN → set new PIN
6. Verify business rules: try deactivating last owner, deactivating self
7. Logout → new user appears on login screen → login works with new PIN

**Step 4: Commit any lint fixes**

If any issues found during testing, fix and commit.

**Step 5: Final commit**

```
✅ test: verify user management CRUD, roles, and business rules
```
