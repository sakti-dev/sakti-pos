import { A, useNavigate } from "@solidjs/router";
import { createResource, createSignal, For, Show } from "solid-js";
import { toast } from "solid-sonner";
import { ConfirmDrawer } from "~/components/confirm-drawer";
import { Button } from "~/components/ui/button";
import { PageHeader } from "~/components/ui/page-header";
import { Skeleton } from "~/components/ui/skeleton";
import {
	type Category,
	deleteCategory,
	getCategories,
	getProductCountByCategory,
	updateCategory,
} from "~/db/menu";
import { cn } from "~/lib/utils";

export default function CategoryList() {
	const navigate = useNavigate();
	const [categories, { refetch }] = createResource(getCategories);
	const [deleteTarget, setDeleteTarget] = createSignal<Category | undefined>();
	const [deleteMessage, setDeleteMessage] = createSignal("");
	const [error, setError] = createSignal("");

	const openDeleteSheet = async (cat: Category) => {
		const count = await getProductCountByCategory(cat.id);
		setDeleteMessage(
			count > 0
				? `Kategori "${cat.name}" memiliki ${count} produk. Produk-produk tersebut tidak akan memiliki kategori. Lanjutkan hapus?`
				: `Hapus kategori "${cat.name}"?`,
		);
		setDeleteTarget(cat);
	};

	const handleDelete = async () => {
		const target = deleteTarget();
		if (!target) {
			return;
		}
		try {
			await deleteCategory(target.id);
			await refetch();
			toast.success("Kategori dihapus");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Gagal menghapus kategori");
		}
	};

	const toggleActive = async (cat: Category) => {
		try {
			await updateCategory(cat.id, { isActive: !cat.isActive });
			await refetch();
			toast.success(
				cat.isActive ? "Kategori dinonaktifkan" : "Kategori diaktifkan",
			);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Gagal mengubah status");
		}
	};

	return (
		<>
			<PageHeader backHref="/menu">Kategori</PageHeader>
			<div class="p-4">
				<Show when={error()}>
					{(msg) => (
						<div class="mb-3 rounded-lg bg-error px-3 py-2 text-error-foreground text-sm">
							<div class="flex items-center justify-between">
								<span>{msg()}</span>
								<button onClick={() => setError("")} type="button">
									✕
								</button>
							</div>
						</div>
					)}
				</Show>

				<div class="mb-4 flex items-center justify-between">
					<p class="text-muted-foreground text-sm">
						{categories()?.length ?? 0} kategori
					</p>
					<A href="/menu/categories/add">
						<Button size="sm">+ Tambah</Button>
					</A>
				</div>

				<Show
					fallback={
						<Show
							fallback={
								<div class="flex flex-col items-center justify-center py-12 text-muted-foreground">
									<p>Belum ada kategori</p>
									<p class="text-sm">
										Tap "+ Tambah" untuk membuat kategori baru
									</p>
								</div>
							}
							when={categories.loading}
						>
							<div class="space-y-2">
								<For each={[1, 2, 3]}>
									{() => (
										<div class="flex items-center gap-2 rounded-xl border bg-card p-3">
											<Skeleton class="h-4 flex-1" />
											<Skeleton class="h-6 w-14" />
											<Skeleton class="size-9" />
											<Skeleton class="size-9" />
										</div>
									)}
								</For>
							</div>
						</Show>
					}
					when={categories()?.length > 0}
				>
					<div class="space-y-2">
						<For each={categories()}>
							{(cat) => (
								<div class="flex items-center gap-2 rounded-xl border bg-card p-3">
									<div class="min-w-0 flex-1">
										<p class="truncate font-medium">{cat.name}</p>
										<Show
											fallback={
												<span class="text-destructive text-xs">Nonaktif</span>
											}
											when={cat.isActive}
										>
											<span class="text-muted-foreground text-xs">Aktif</span>
										</Show>
									</div>
									<button
										class={cn(
											"shrink-0 rounded-full px-2.5 py-1 font-medium text-xs",
											cat.isActive
												? "bg-success text-success-foreground"
												: "bg-muted text-muted-foreground",
										)}
										onClick={() => toggleActive(cat)}
										type="button"
									>
										{cat.isActive ? "Aktif" : "Nonaktif"}
									</button>
									<button
										class="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
										onClick={() => navigate(`/menu/categories/${cat.id}/edit`)}
										type="button"
									>
										✏️
									</button>
									<button
										class="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
										onClick={() => openDeleteSheet(cat)}
										type="button"
									>
										🗑️
									</button>
								</div>
							)}
						</For>
					</div>
				</Show>
			</div>

			<ConfirmDrawer
				message={deleteMessage()}
				onClose={() => setDeleteTarget(undefined)}
				onConfirm={handleDelete}
				open={!!deleteTarget()}
				title="Hapus Kategori"
			/>
		</>
	);
}
