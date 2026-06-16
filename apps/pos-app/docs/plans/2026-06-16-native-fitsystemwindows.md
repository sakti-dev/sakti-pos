# Native fitsSystemWindows Safe-Area Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move all safe-area handling to the native Android layer so the status bar strip is drawn by a native View, completely immune to WebView visual-viewport pan when the keyboard opens.

**Architecture:** Instead of filling the status bar region with DOM elements (which get dragged off-screen by visual-viewport panning), apply system bar + IME insets as **native padding** on the Android content view (`android.R.id.content`). The content view's background fills the status bar strip — a native View that never moves. The WebView is laid out entirely below the status bar and shrinks from the bottom when the keyboard opens.

**Why this works:** On Android 15+ edge-to-edge, `position: fixed` / `absolute` elements are pinned to the *layout viewport*, but Chromium scrolls the *visual viewport* independently to reveal focused inputs — dragging DOM elements off-screen. A native View's padding/background is outside the WebView entirely and cannot be affected by viewport scrolling.

**Tech Stack:** Tauri 2.0, SolidJS, Kotlin (AndroidX Core ViewCompat), Tailwind v4 CSS

**Target device:** Redmi Pad 2, Android 16 (API 36), HyperOS

---

## What this replaces

The previous approach (DOM spacers + JS bridge + `evaluateJavascript`) is being fully reverted. The native padding approach is simpler on the frontend and bulletproof on the native side.

### Frontend files to clean up (revert all spacer code)

| File | Current state (has spacer) | Target state (clean) |
|------|---------------------------|---------------------|
| `safe-area-shell.tsx` | Has `useSafeAreaTop` hook + absolute spacer div + margin-top | Plain flex container, no spacer |
| `top-bar.tsx` | Has CSS var spacer div + nested content wrapper | Simple single-level fixed header |
| `sidebar.tsx` | Has CSS var spacer div + inner wrapper div | Simple single-level fixed nav |
| `app-shell/index.tsx` | Has `--android-safe-top` in calc | Original `100dvh`-based calc |
| `index.css` | Has `position:fixed; inset:0` lock on html/body/#root | Simple `height:100%` chain |
| `lib/use-safe-area-top.ts` | Exists (JS bridge reader) | **Delete** |
| `global.d.ts` | Exists (AndroidInsets type) | **Delete** |

### Native files to create/modify

| File | Change |
|------|--------|
| `MainActivity.kt` | `enableEdgeToEdge` + `ViewCompat` inset listener applying top/bottom padding + DayNight background |
| `values/colors.xml` | Add `app_background` color (light: parchment) |
| `values-night/colors.xml` | **Recreate** with `app_background` color (dark) |
| `tauri.conf.json` | Keep `fullscreen: false` (status bar visible) |
| `themes.xml` (both) | Already clean from previous session |

---

### Task 1: Clean up frontend — remove all DOM spacers and JS bridge

**Files:**
- Modify: `src/components/layout/safe-area-shell.tsx`
- Modify: `src/components/layout/app-shell/top-bar.tsx`
- Modify: `src/components/layout/app-shell/sidebar.tsx`
- Modify: `src/components/layout/app-shell/index.tsx`
- Modify: `src/styles/index.css`
- Delete: `src/lib/use-safe-area-top.ts`
- Delete: `src/global.d.ts`

**Step 1: Revert SafeAreaShell to plain container**

Current file imports `useSafeAreaTop`, renders an absolute spacer div, and uses `margin-top` to push content down. Replace the entire file with:

```tsx
import type { JSX } from "solid-js";
import { cn } from "~/lib/utils";

interface SafeAreaShellProps {
  readonly children: JSX.Element;
  readonly class?: string;
  readonly [key: string]: unknown;
}

/**
 * Full-screen shell for pages without the app chrome (TopBar/Sidebar/NotchNav).
 * Status bar inset is handled natively by MainActivity (content view padding),
 * so no DOM spacer is needed — just a flex container with border-t.
 */
export const SafeAreaShell = (props: SafeAreaShellProps) => (
  <div
    {...props}
    class={cn(
      "flex h-[100dvh] w-full flex-col overflow-hidden font-sans text-foreground antialiased",
      props.class,
    )}
  >
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden border-border border-t">
      {props.children}
    </div>
  </div>
);
```

**Step 2: Revert TopBar to single-level header**

Current TopBar has a spacer div + nested content wrapper. The current code (around line 73) is:

```tsx
export const TopBar = (props: TopBarProps) => (
  <header
    class={cn(
      "fixed top-0 right-0 left-0 z-50 flex flex-col bg-card lg:left-sidebar-rail",
      props.isShell ? "" : "hidden"
    )}
    onPointerDown={props.onClose}
  >
    <div
      class="shrink-0 bg-card"
      style={{
        height: "var(--android-safe-top, env(safe-area-inset-top, 0px))",
      }}
    />
    <div class="flex h-header shrink-0 items-center justify-between border-border border-t border-b px-gutter lg:px-7">
      <TopBarContent />
    </div>
  </header>
```

Replace with:

```tsx
export const TopBar = (props: TopBarProps) => (
  <header
    class={cn(
      "fixed top-0 right-0 left-0 z-50 flex h-header shrink-0 items-center justify-between border-border border-b bg-card px-gutter lg:left-sidebar-rail lg:px-7",
      props.isShell ? "" : "hidden",
    )}
    onPointerDown={props.onClose}
  >
    <TopBarContent />
  </header>
);
```

**Step 3: Revert Sidebar to single-level nav**

Current Sidebar has a spacer div + inner wrapper div inside `<nav>`. Remove both. The current nav opening (around line 59) is:

```tsx
      <nav
        class={cn(
          "relative flex h-full w-sidebar-expanded flex-col bg-card transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] lg:flex",
          props.expanded
            ? "shadow-2xl [clip-path:inset(0_0_0_0)]"
            : "[clip-path:inset(0_122px_0_0)]"
        )}
        onClick={props.onTouch}
      >
        <div
          class="shrink-0 bg-card"
          style={{ height: "var(--android-safe-top, env(safe-area-inset-top, 0px))" }}
        />
        <div class="flex flex-1 flex-col border-border border-r border-t px-3 pt-5 pb-4">
```

Replace with:

```tsx
      <nav
        class={cn(
          "relative flex h-full w-sidebar-expanded flex-col border-border border-r bg-card px-3 pt-5 pb-4 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] lg:flex",
          props.expanded
            ? "shadow-2xl [clip-path:inset(0_0_0_0)]"
            : "[clip-path:inset(0_122px_0_0)]"
        )}
        onClick={props.onTouch}
      >
```

Then remove the extra closing `</div>` that was added before `</nav>` (around line 147):

```tsx
        </Button>
        </div>
      </nav>
```

Should become:

```tsx
        </Button>
      </nav>
```

**Step 4: Revert AppShell main calc**

Current (around line 113):

```tsx
          isShell() &&
            "mt-[calc(var(--spacing-header)+var(--android-safe-top,env(safe-area-inset-top,0px)))] h-[calc(100dvh-var(--spacing-header)-var(--android-safe-top,env(safe-area-inset-top,0px)))] lg:ml-sidebar-rail",
          !isShell() && "h-full overflow-hidden"
```

Replace with:

```tsx
          isShell() &&
            "mt-header h-[calc(100dvh-var(--spacing-header))] lg:ml-sidebar-rail",
          !isShell() && "h-[100dvh] overflow-hidden"
```

**Step 5: Revert index.css — replace position:fixed lock with height chain**

Current (around line 14):

```css
  /* ── Layout envelope lock ──
     position:fixed on html/body/#root neutralizes the Android WebView
     visual-viewport pan defect: when the soft keyboard opens, the browser
     can trigger a fallback scroll on the visual-viewport layer. Locking
     the envelope with fixed + inset:0 + height:100% forces the layout
     boundary to match the shrunken WebView container exactly. */
  html,
  body,
  #root {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    margin: 0;
    overflow: hidden;
    overscroll-behavior: none;
  }

  body {
```

Replace with:

```css
  html,
  body,
  #root {
    height: 100%;
    margin: 0;
    overflow: hidden;
  }

  body {
```

**Step 6: Delete the JS bridge files**

```bash
rm src/lib/use-safe-area-top.ts src/global.d.ts
```

**Step 7: Verify tsc + ultracite**

```bash
cd apps/pos-app && bun x ultracite fix && bun x ultracite check && bun x tsc --noEmit
```

Expected: all pass.

---

### Task 2: Add DayNight background colors

**Files:**
- Modify: `src-tauri/gen/android/app/src/main/res/values/colors.xml`
- Create: `src-tauri/gen/android/app/src/main/res/values-night/colors.xml`

**Step 1: Add app_background to values/colors.xml**

Add before `</resources>`:

```xml
    <!-- Content view background. Fills the status bar strip natively.
         Light: parchment oklch(0.9897 0.0066 106.52) ≈ #f9f8f2 -->
    <color name="app_background">#FFF9F8F2</color>
```

**Step 2: Create values-night/colors.xml**

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Content view background. Fills the status bar strip natively.
         Dark: oklch(19.574% 0.00002 271.152) ≈ #1a1a1a -->
    <color name="app_background">#FF1A1A1A</color>
</resources>
```

**Note on theme accuracy:** These use Android's DayNight mechanism — they match the *system* dark mode setting. If the user explicitly sets a different theme inside the app (via Kobalte's `sakti-theme` localStorage), the status bar strip color might not match. This is acceptable for v1. A JS→Kotlin Tauri command can be added later if exact theme sync is needed.

---

### Task 3: Implement native fitsSystemWindows in MainActivity.kt

**Files:**
- Modify: `src-tauri/gen/android/app/src/main/java/com/sakti_dev/sakti_pos/MainActivity.kt`

**Step 1: Replace MainActivity.kt**

Replace the entire file with:

```kotlin
package com.sakti_dev.sakti_pos

import android.os.Bundle
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding

class MainActivity : TauriActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        val contentView = window.decorView
            .findViewById<View>(android.R.id.content)

        // Fill the status-bar strip (the content view's padding area) with
        // a DayNight-aware background color. This is a native View — it
        // cannot be dragged off-screen by WebView visual-viewport panning.
        contentView.setBackgroundResource(R.color.app_background)

        // Apply system bar + IME insets as native padding on the content view.
        // The WebView is laid out entirely within this padded area:
        //   - top padding = status bar height → content starts below status bar
        //   - bottom padding = max(nav bar, keyboard) → content stays above keyboard
        ViewCompat.setOnApplyWindowInsetsListener(contentView) { view, windowInsets ->
            val systemBars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars())

            // Pad top for the status bar strip. Bottom padding is left to
            // android:windowSoftInputMode="adjustResize" (manifest): the OS
            // shrinks the view frame when the keyboard opens. Adding ime.bottom
            // here would double-count and render an empty block under the form.
            view.updatePadding(
                top = systemBars.top,
                bottom = 0,
            )
            windowInsets
        }
    }
}
```

**Key points:**
- `enableEdgeToEdge()` — mandatory on Android 15+, also ensures insets are dispatched
- `setBackgroundColor` / `setBackgroundResource` — fills the padding strip, drawn by native, immune to WebView pan
- `ViewCompat.setOnApplyWindowInsetsListener` — fires on rotation and any system UI change
- `systemBars.top` → pushes WebView below status bar
- **Top-only padding** — we deliberately do NOT pad the bottom for IME. The manifest's `android:windowSoftInputMode="adjustResize"` lets the OS shrink the view frame when the keyboard opens; adding `ime.bottom` padding on top of that would cause **double-bottom-padding** (a huge empty color block under the form). See "Double-padding trap" note below.

**Step 2: Verify no unused imports remain**

The previous version had `findWebView`, `JavascriptInterface`, `WebView`, `ViewGroup` imports. The new version only needs `View`, `enableEdgeToEdge`, `ViewCompat`, `WindowInsetsCompat`, `updatePadding`, `Bundle`.

**> ⚠️ The Double-Padding Trap**

Under Android 15/16's mandatory `enableEdgeToEdge()`, when `adjustResize` is in the manifest the Android Window Manager already compresses the bottom of the view frame to clear the keyboard. If your `ViewCompat` listener *also* adds `ime.bottom` as manual padding to that same container, the result is **double-bottom-padding**: a massive empty color block equal to the keyboard height rendered under the form fields.

Fix: let `adjustResize` own the bottom resize. Use the listener **only** for the top status-bar plane (`bottom = 0`).

---

### Task 4: Build and verify on device

**Step 1: Build + deploy**

```bash
cd apps/pos-app && bun app:dev
```

**Step 2: Verify checklist**

On the tablet:
- [ ] Home page (shell zone): TopBar sits below status bar, status bar strip is solid parchment color
- [ ] Sidebar: starts below status bar, borders look correct
- [ ] Login page (SafeAreaShell): content starts below status bar
- [ ] Tap email field on login → keyboard opens → **status bar strip stays pinned** (this is the key test)
- [ ] Scroll form content → status bar strip does not move
- [ ] Toggle app theme (Settings → General) → status bar strip color should match if system theme also matches

**Step 3: If status bar strip is wrong color or transparent**

- Check that `R.color.app_background` resolves: temporarily hardcode `contentView.setBackgroundColor(0xFFF9F8F2.toInt())` to rule out resource resolution
- Check that padding is applied: temporarily log `systemBars.top` via `Log.d("SafeArea", "top=$systemBars")`
- Check that the WebView is actually a child of `android.R.id.content`: if Tauri uses a different container, the padding won't affect the WebView. Inspect with Layout Inspector

**Step 4: If keyboard still covers inputs or a huge gap appears**

- **Huge gap under the form = double-padding bug.** This means both `adjustResize` and manual `ime.bottom` padding are active. Confirm `MainActivity.kt` uses `bottom = 0` (not `ime.bottom`).
- If inputs are covered by keyboard, verify `android:windowSoftInputMode="adjustResize"` is in the manifest and `enableEdgeToEdge()` is called before `super.onCreate()`.

---

## Summary

| Layer | Before (DOM spacer) | After (native padding) |
|-------|--------------------|-----------------------|
| Status bar fill | DOM div with `position: absolute` | Native content view background |
| Keyboard handling | `adjustResize` + CSS `position:fixed` hack | Native IME inset → content view bottom padding |
| Theme awareness | JS bridge `evaluateJavascript` | DayNight color resources |
| Visual viewport pan | **Broken** — spacer dragged off-screen | **Immune** — native View outside WebView |
| Frontend complexity | Spacer divs in TopBar/Sidebar/SafeAreaShell + hook + CSS vars | Zero — clean components |
