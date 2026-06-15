import { createSignal } from "solid-js";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogFooter,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  AdaptiveDialogTrigger,
} from "~/components/ui/adaptive-dialog";
import { Button } from "~/components/ui/button";

export default function ExperimentPage() {
  const [open, setOpen] = createSignal(false);

  return (
    <div class="flex min-h-screen items-center justify-center bg-muted p-gutter">
      <AdaptiveDialog onOpenChange={setOpen} open={open()}>
        <AdaptiveDialogTrigger as={Button} look="outline" tone="primary">
          Open Dialog
        </AdaptiveDialogTrigger>
        <AdaptiveDialogContent class="max-w-md">
          <AdaptiveDialogHeader>
            <AdaptiveDialogTitle>Delete product?</AdaptiveDialogTitle>
            <AdaptiveDialogDescription>
              This will permanently delete the product and all its variants.
              This action cannot be undone.
            </AdaptiveDialogDescription>
          </AdaptiveDialogHeader>
          <div class="text-body-sm text-muted-foreground">
            <p>
              Product: <span class="font-medium text-foreground">Espresso</span>
            </p>
            <p>
              SKU: <span class="font-medium text-foreground">ESP-001</span>
            </p>
            <p>
              Stock: <span class="font-medium text-foreground">120 units</span>
            </p>
          </div>
          <AdaptiveDialogFooter>
            <Button look="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setOpen(false)} tone="danger">
              Delete
            </Button>
          </AdaptiveDialogFooter>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    </div>
  );
}
