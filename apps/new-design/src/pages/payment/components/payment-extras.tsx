interface PaymentExtrasProps {
  readonly customer: string;
  readonly notes: string;
  readonly onCustomerChange: (v: string) => void;
  readonly onNotesChange: (v: string) => void;
}

export const PaymentExtras = (props: PaymentExtrasProps) => (
  <div class="rounded-lg border border-border/50 bg-card px-6 py-5">
    <div class="grid grid-cols-2 gap-3 max-[600px]:grid-cols-1">
      <div>
        <label
          class="mb-1.5 block font-medium text-[12px] text-muted-foreground"
          for="customer"
        >
          Nama Pelanggan
        </label>
        <input
          class="h-11 w-full rounded-[10px] border-[1.5px] border-border bg-muted px-3.5 font-sans text-[14px] text-foreground transition-[border-color,box-shadow] duration-150 placeholder:text-faint-foreground focus:border-primary focus:bg-card focus:ring-2 focus:ring-primary/10 focus:outline-none dark:focus:border-primary"
          id="customer"
          onInput={(e) => props.onCustomerChange(e.currentTarget.value)}
          placeholder="Opsional"
          type="text"
          value={props.customer}
        />
      </div>
      <div>
        <label
          class="mb-1.5 block font-medium text-[12px] text-muted-foreground"
          for="notes"
        >
          Catatan
        </label>
        <input
          class="h-11 w-full rounded-[10px] border-[1.5px] border-border bg-muted px-3.5 font-sans text-[14px] text-foreground transition-[border-color,box-shadow] duration-150 placeholder:text-faint-foreground focus:border-primary focus:bg-card focus:ring-2 focus:ring-primary/10 focus:outline-none dark:focus:border-primary"
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
