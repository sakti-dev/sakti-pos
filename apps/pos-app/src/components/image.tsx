import type { Accessor, JSX } from "solid-js";
import { Show, splitProps } from "solid-js";
import { productImageAdapter } from "~/lib/assets/adapters/product-images";

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

  const imageUrl = productImageAdapter.useImageUrl(
    () => local.imageAssetId,
    () => local.entityId
  );
  return <ImageBase {...imgProps} imageUrl={imageUrl} />;
}
