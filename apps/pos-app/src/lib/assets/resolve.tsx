import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { createResource, Show } from "solid-js";

const urlCache = new Map<string, string>();

export function cachedAssetUrl(assetId: string | null): string | undefined {
  if (!assetId) {
    return;
  }
  return urlCache.get(assetId);
}

export async function resolveImageUrl(
  assetId: string | null
): Promise<{ assetId: string; url: string } | null> {
  if (!assetId) {
    return null;
  }
  const url = await resolveAssetUrl(assetId);
  return url ? { assetId, url } : null;
}

async function resolveAssetUrl(assetId: string): Promise<string | undefined> {
  const cached = urlCache.get(assetId);
  if (cached) {
    return cached;
  }
  try {
    const res = await invoke<{ localPath: string } | null>(
      "plugin:image-pipeline|get_asset_path",
      { assetId }
    );
    if (res) {
      const url = convertFileSrc(res.localPath);
      urlCache.set(assetId, url);
      return url;
    }
  } catch {
    return;
  }
  return;
}

/** Product thumbnail: resolves the asset's cached local URL, falls back to an initial tile. */
export function ProductThumb(props: {
  assetId: string | null;
  name: string;
  size?: "sm" | "lg";
}) {
  const [url] = createResource(
    () => props.assetId,
    (id) => (id ? resolveAssetUrl(id) : Promise.resolve(null))
  );

  return (
    <Show
      fallback={
        <div
          aria-hidden
          class="grid h-full w-full select-none place-items-center bg-primary/5 font-bold text-primary/40"
          role="presentation"
        >
          {props.name.charAt(0).toUpperCase()}
        </div>
      }
      when={url()}
    >
      <img
        alt={props.name}
        class="h-full w-full object-cover"
        loading="lazy"
        src={url()!}
      />
    </Show>
  );
}
