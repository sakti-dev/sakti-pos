import { clsx } from "clsx";
import { createSignal, For } from "solid-js";
import { Button } from "./button";

interface PinPadProps {
	disabled?: boolean;
	maxLength?: number;
	onSubmit: (pin: string) => void;
}

const KEYS = [
	{ value: "1", label: "1" },
	{ value: "2", label: "2" },
	{ value: "3", label: "3" },
	{ value: "4", label: "4" },
	{ value: "5", label: "5" },
	{ value: "6", label: "6" },
	{ value: "7", label: "7" },
	{ value: "8", label: "8" },
	{ value: "9", label: "9" },
	{ value: "del", label: "⌫" },
	{ value: "0", label: "0" },
	{ value: "ok", label: "OK" },
];

export default function PinPad(props: PinPadProps) {
	const [pin, setPin] = createSignal("");
	const maxLen = () => props.maxLength ?? 6;
	const isComplete = () => pin().length >= maxLen();
	const dots = () => Array.from({ length: maxLen() }, (_, i) => i);

	const handleKey = (key: string) => {
		if (props.disabled) {
			return;
		}
		if (key === "del") {
			setPin((p) => p.slice(0, -1));
			return;
		}
		if (key === "ok") {
			if (isComplete()) {
				props.onSubmit(pin());
			}
			return;
		}
		if (pin().length < maxLen()) {
			setPin((p) => p + key);
		}
	};

	return (
		<div class="flex flex-col items-center gap-4">
			<div class="flex justify-center gap-3">
				<For each={dots()}>
					{(i) => (
						<div
							class={clsx(
								"h-4 w-4 rounded-full border-2 transition-all duration-150",
								i < pin().length
									? "scale-110 border-primary bg-primary"
									: "border-muted-foreground/30 bg-transparent",
							)}
						/>
					)}
				</For>
			</div>

			<div class="grid w-64 grid-cols-3 gap-2">
				<For each={KEYS}>
					{(key) => (
						<Button
							disabled={props.disabled}
							onClick={() => handleKey(key.value)}
							size="numpad"
							variant={key.value === "ok" ? "default" : "secondary"}
						>
							{key.label}
						</Button>
					)}
				</For>
			</div>
		</div>
	);
}
