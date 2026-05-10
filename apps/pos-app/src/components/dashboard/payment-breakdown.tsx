import { Doughnut } from "solid-chartjs";
import type { Component } from "solid-js";
import { Match, Show, Switch } from "solid-js";
import { Skeleton } from "~/components/ui/skeleton";
import type { PaymentBreakdown } from "~/db/dashboard";
import "~/lib/dashboard/chart-setup";
import { formatIDR } from "~/lib/utils";

interface PaymentBreakdownChartProps {
	data?: PaymentBreakdown | undefined;
	loading?: boolean;
}

export const PaymentBreakdownChart: Component<PaymentBreakdownChartProps> = (
	props,
) => {
	const total = () => {
		const d = props.data;
		return d ? d.cashTotal + d.qrisTotal : 0;
	};

	const chartData = () => {
		const d = props.data;
		if (!d || total() === 0) {
			return null;
		}
		return {
			datasets: [
				{
					backgroundColor: ["oklch(0.6 0.15 145)", "oklch(0.65 0.18 250)"],
					data: [d.cashTotal, d.qrisTotal],
					label: "Pembayaran",
				},
			],
			labels: ["Tunai", "QRIS"],
		};
	};

	const cashPct = () => {
		const d = props.data;
		if (!d) {
			return 0;
		}
		return total() > 0 ? Math.round((d.cashTotal / total()) * 100) : 0;
	};

	return (
		<div class="rounded-xl border bg-card p-4">
			<h3 class="mb-3 font-medium text-sm">Metode Pembayaran</h3>
			<Show
				when={props.loading}
				fallback={
					<Switch
						fallback={
							<p class="py-8 text-center text-muted-foreground text-sm">
								Belum ada data
							</p>
						}
					>
						<Match when={chartData()}>
							{(cd) => (
								<>
									<div class="mx-auto w-48">
										<Doughnut
											data={cd()}
											options={{
												cutout: "65%",
												plugins: {
													legend: { display: false },
													tooltip: {
														callbacks: {
															label: (ctx: {
																label?: string;
																parsed: unknown;
															}) => {
																const val = ctx.parsed as number;
																const formatted = new Intl.NumberFormat(
																	"id-ID",
																	{
																		maximumFractionDigits: 0,
																		style: "currency",
																		currency: "IDR",
																	},
																).format(val);
																return ` ${ctx.label}: ${formatted}`;
															},
														},
													},
												},
											}}
										/>
									</div>
									<div class="mt-3 flex justify-center gap-6 text-sm">
										<div>
											<div class="flex items-center gap-1.5">
												<span class="inline-block size-2.5 shrink-0 rounded-full bg-[oklch(0.6_0.15_145)]" />
												<span>Tunai {cashPct()}%</span>
											</div>
											<span class="pl-[18px] text-xs text-muted-foreground">
												{formatIDR(props.data?.cashTotal)}
											</span>
										</div>
										<div>
											<div class="flex items-center gap-1.5">
												<span class="inline-block size-2.5 shrink-0 rounded-full bg-[oklch(0.65_0.18_250)]" />
												<span>QRIS {100 - cashPct()}%</span>
											</div>
											<span class="pl-[18px] text-xs text-muted-foreground">
												{formatIDR(props.data?.qrisTotal)}
											</span>
										</div>
									</div>
								</>
							)}
						</Match>
					</Switch>
				}
			>
				<Skeleton class="mx-auto h-48 w-48" />
			</Show>
		</div>
	);
};
