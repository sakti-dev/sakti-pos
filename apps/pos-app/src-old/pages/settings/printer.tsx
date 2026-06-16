import PrinterSettings from "~/components/settings/printer-settings";
import { PageHeader } from "~/components/ui/page-header";

export default function PrinterSettingsPage() {
  return (
    <>
      <PageHeader backHref="/settings">Printer</PageHeader>
      <div class="p-4">
        <PrinterSettings />
      </div>
    </>
  );
}
