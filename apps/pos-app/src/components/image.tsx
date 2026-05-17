import type { Accessor } from "solid-js";
import { Show } from "solid-js";
import { productImageAdapter } from "~/lib/assets/adapters/product-images";

interface ImageBaseProps {
  alt: string;
  class?: string;
  imageUrl: Accessor<string | null>;
}

function ImageBase(props: ImageBaseProps) {
  return (
    <Show
      fallback={
        <div
          class={`flex items-center justify-center rounded-lg bg-muted text-muted-foreground text-xs ${props.class ?? ""}`}
        >
          Foto
        </div>
      }
      when={props.imageUrl()}
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

interface ProductImageProps {
  alt: string;
  class?: string;
  entityId?: string | null;
  imageAssetId?: string | null;
}

export function ProductImage(props: ProductImageProps) {
  const imageUrl = productImageAdapter.useImageUrl(
    () => props.imageAssetId,
    () => props.entityId
  );
  return <ImageBase alt={props.alt} class={props.class} imageUrl={imageUrl} />;
}
