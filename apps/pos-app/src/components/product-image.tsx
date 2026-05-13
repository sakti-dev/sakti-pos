import { createResource, Show } from "solid-js";
import { resolveCachedProductImageUrl } from "~/lib/product-images/cache";
import { getPendingProductPhotoPreviewUrl } from "~/lib/product-images/pending";
import { getAssetCacheVersion } from "~/store/asset-cache";

interface ProductImageProps {
  alt: string;
  class?: string;
  imageAssetId?: string | null;
  productId?: string | null;
}

export function ProductImage(props: ProductImageProps) {
  const [cachedImageUrl] = createResource(
    () => ({
      assetId: props.imageAssetId,
      version: getAssetCacheVersion(props.imageAssetId),
    }),
    ({ assetId }) => resolveCachedProductImageUrl(assetId)
  );
  const [pendingImageUrl] = createResource(
    () => ({
      imageAssetId: props.imageAssetId,
      productId: props.productId,
    }),
    ({ productId }) => getPendingProductPhotoPreviewUrl(productId)
  );
  const imageUrl = () => pendingImageUrl() ?? cachedImageUrl();

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
