interface PaymentExtrasProps {
  readonly customer: string;
  readonly notes: string;
  readonly onCustomerChange: (v: string) => void;
  readonly onNotesChange: (v: string) => void;
}

export const PaymentExtras = (props: PaymentExtrasProps) => (
  <div class="rounded-lg border border-border-light bg-surface px-6 py-5 dark:border-[rgba(255,255,255,0.04)] dark:bg-[#1a1a1a]">
    <div class="grid grid-cols-2 gap-3 max-[600px]:grid-cols-1">
      <div>
        <label
          class="mb-1.5 block font-medium text-[12px] text-text-secondary dark:text-[#888]"
          for="customer"
        >
          Nama Pelanggan
        </label>
        <input
          class="h-11 w-full rounded-[10px] border-[1.5px] border-border bg-surface-gray px-3.5 font-sans text-[14px] text-text transition-[border-color,box-shadow] duration-150 placeholder:text-text-muted focus:border-primary focus:bg-surface focus:shadow-[0_0_0_3px_rgba(26,51,0,0.08)] focus:outline-none dark:border-[rgba(255,255,255,0.10)] dark:bg-[#222] dark:text-[#f0f0f0] dark:focus:border-accent dark:focus:bg-[#1a1a1a] dark:placeholder:text-[#555]"
          id="customer"
          onInput={(e) => props.onCustomerChange(e.currentTarget.value)}
          placeholder="Opsional"
          type="text"
          value={props.customer}
        />
      </div>
      <div>
        <label
          class="mb-1.5 block font-medium text-[12px] text-text-secondary dark:text-[#888]"
          for="notes"
        >
          Catatan
        </label>
        <input
          class="h-11 w-full rounded-[10px] border-[1.5px] border-border bg-surface-gray px-3.5 font-sans text-[14px] text-text transition-[border-color,box-shadow] duration-150 placeholder:text-text-muted focus:border-primary focus:bg-surface focus:shadow-[0_0_0_3px_rgba(26,51,0,0.08)] focus:outline-none dark:border-[rgba(255,255,255,0.10)] dark:bg-[#222] dark:text-[#f0f0f0] dark:focus:border-accent dark:focus:bg-[#1a1a1a] dark:placeholder:text-[#555]"
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
