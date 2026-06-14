interface PaymentExtrasProps {
  readonly customer: string;
  readonly notes: string;
  readonly onCustomerChange: (v: string) => void;
  readonly onNotesChange: (v: string) => void;
}

export const PaymentExtras = (props: PaymentExtrasProps) => (
  <div class="rounded-lg border border-border/50 bg-card px-6 py-5">
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label
          class="mb-1.5 block font-medium text-caption text-muted-foreground"
          for="customer"
        >
          Nama Pelanggan
        </label>
        <input
          class="h-11 w-full rounded-sm border-[1.5px] border-border bg-background px-3.5 font-sans text-body-sm text-foreground transition-[border-color,box-shadow] duration-150 placeholder:text-faint-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/10"
          id="customer"
          onInput={(e) => props.onCustomerChange(e.currentTarget.value)}
          placeholder="Opsional"
          type="text"
          value={props.customer}
        />
      </div>
      <div>
        <label
          class="mb-1.5 block font-medium text-caption text-muted-foreground"
          for="notes"
        >
          Catatan
        </label>
        <input
          class="h-11 w-full rounded-sm border-[1.5px] border-border bg-background px-3.5 font-sans text-body-sm text-foreground transition-[border-color,box-shadow] duration-150 placeholder:text-faint-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/10"
          id="notes"
          onInput={(e) => props.onNotesChange(e.currentTarget.value)}
          placeholder="Opsional"
          type="text"
          value={props.notes}
        />
      </div>
    </div>
  </div>
);
