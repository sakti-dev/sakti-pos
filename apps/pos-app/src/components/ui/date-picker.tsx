import dayjs from "dayjs";
import { TbOutlineSelector } from "solid-icons/tb";
import type { Component } from "solid-js";
import { cn } from "~/lib/utils";

interface DatePickerProps {
	class?: string;
	max?: string;
	min?: string;
	onChange: (value: string) => void;
	value: string;
}

const formatDate = (dateStr: string): string => {
	if (!dateStr) {
		return "";
	}
	return dayjs(dateStr).format("DD MMM YYYY");
};

const DatePicker: Component<DatePickerProps> = (props) => (
	<div class={cn("relative", props.class)}>
		<div class="pointer-events-none flex h-10 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm">
			<span class={cn(!props.value && "text-muted-foreground")}>
				{props.value ? formatDate(props.value) : "Pilih tanggal"}
			</span>
			<TbOutlineSelector class="size-4 shrink-0 opacity-50" />
		</div>
		<input
			class="absolute inset-0 cursor-pointer opacity-0"
			max={props.max}
			min={props.min}
			onChange={(e) => props.onChange((e.target as HTMLInputElement).value)}
			type="date"
			value={props.value}
		/>
	</div>
);

export { DatePicker };
