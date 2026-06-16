import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mockLastAssetQueueCount = vi.fn(() => 0);
const mockSyncNow = vi.fn();
const mockSyncStatus = vi.fn(() => "idle");

function testIcon(testId: string) {
  const icon = document.createElement("span");
  icon.dataset.testid = testId;
  return icon;
}

vi.mock("solid-icons/tb", () => ({
  TbOutlineCloud: () => testIcon("icon-cloud"),
  TbOutlineCloudOff: () => testIcon("icon-cloud-off"),
  TbOutlineCloudUpload: () => testIcon("icon-cloud-upload"),
  TbOutlineLoader2: () => testIcon("icon-loader"),
}));

vi.mock("solid-sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("~/store/sync", () => ({
  formatSyncSuccessMessage: () => "Sinkronisasi berhasil",
  lastAssetQueueCount: () => mockLastAssetQueueCount(),
  syncNow: (...args: unknown[]) => mockSyncNow(...args),
  syncStatus: () => mockSyncStatus(),
}));

import { toast } from "solid-sonner";
import { SyncStatusIndicator } from "../sync-status";

function setOnlineStatus(online: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: online,
  });
}

describe("SyncStatusIndicator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLastAssetQueueCount.mockReturnValue(0);
    mockSyncNow.mockResolvedValue({
      mode: "skipped",
      pull: { rows_received: 0, server_time: "" },
      purged: 0,
      push: { server_time: "", server_wins_count: 0, tables_synced: [] },
    });
    mockSyncStatus.mockReturnValue("idle");
    setOnlineStatus(true);
  });

  test("runs sync and shows success toast when clicked", async () => {
    render(() => <SyncStatusIndicator />);

    await userEvent.click(screen.getByRole("button", { name: "Sinkronkan" }));

    expect(mockSyncNow).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Sinkronisasi berhasil");
  });

  test("shows cloud off icon when browser is offline", () => {
    setOnlineStatus(false);

    render(() => <SyncStatusIndicator />);

    expect(screen.getByTestId("icon-cloud-off")).toBeInTheDocument();
  });

  test("disables manual sync while syncing", () => {
    mockSyncStatus.mockReturnValue("syncing");

    render(() => <SyncStatusIndicator />);

    expect(
      screen.getByRole("button", { name: "Sedang menyinkronkan" })
    ).toBeDisabled();
    expect(screen.getByTestId("icon-loader")).toBeInTheDocument();
  });
});
