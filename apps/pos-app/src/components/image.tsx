import type { Accessor, JSX } from "solid-js";
import { createSignal, onMount, Show, splitProps } from "solid-js";
import { resolveAssetUrl } from "~/lib/assets/cache";

interface ImageBaseProps extends JSX.ImgHTMLAttributes<HTMLImageElement> {
  fallback?: JSX.Element;
  imageUrl: Accessor<string | null>;
}

function ImageBase(props: ImageBaseProps) {
  const [local, imgProps] = splitProps(props, [
    "imageUrl",
    "fallback",
    "class",
    "alt",
  ]);

  const classStr = () =>
    `flex items-center justify-center bg-muted text-muted-foreground text-xs ${local.class ?? ""}`;

  return (
    <Show
      fallback={<div class={classStr()}>{local.fallback ?? "Foto"}</div>}
      when={local.imageUrl()}
    >
      {(src) => (
        // biome-ignore lint/correctness/useImageSize: dimensions come from imgProps spread
        <img
          alt={local.alt ?? ""}
          {...imgProps}
          class={`object-cover ${local.class ?? ""}`}
          src={src()}
        />
      )}
    </Show>
  );
}

interface ProductImageProps extends JSX.ImgHTMLAttributes<HTMLImageElement> {
  entityId?: string | null;
  imageAssetId?: string | null;
}

export function ProductImage(props: ProductImageProps) {
  const [local, imgProps] = splitProps(props, ["entityId", "imageAssetId"]);
  const [url, setUrl] = createSignal<string | null>(null);

  onMount(() => {
    const assetId = local.imageAssetId;
    if (assetId) {
      resolveAssetUrl(assetId).then(setUrl);
    }
  });

  return <ImageBase {...imgProps} imageUrl={url} />;
}
