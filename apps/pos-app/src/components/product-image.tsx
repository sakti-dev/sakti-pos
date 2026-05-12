import { createResource, Show } from "solid-js";
import { resolveCachedProductImageUrl } from "~/lib/product-images/cache";

interface ProductImageProps {
  alt: string;
  class?: string;
  imageAssetId?: string | null;
}

export function ProductImage(props: ProductImageProps) {
  const [imageUrl] = createResource(
    () => props.imageAssetId,
    resolveCachedProductImageUrl
  );

  return (
    <Show
      fallback={
        <div
          class={`flex items-center justify-center rounded-lg bg-muted text-muted-foreground text-xs ${props.class ?? ""}`}
        >
          Foto
        </div>
      }
      when={imageUrl()}
    >
      {(src) => (
        <img
          alt={props.alt}
          class={`object-cover ${props.class ?? ""}`}
          height={64}
          src={src()}
          width={64}
        />
      )}
    </Show>
  );
}
