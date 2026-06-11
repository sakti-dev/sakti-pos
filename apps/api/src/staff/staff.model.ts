import { t } from "elysia";

export const Staff = t.Object({
  id: t.String(),
  merchantId: t.String(),
  outletId: t.Nullable(t.String()),
  name: t.String(),
  role: t.String(),
  isActive: t.Boolean(),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const StaffCurrentRequest = t.Object({
  merchantId: t.String(),
});

export const StaffCurrentResponse = t.Object({
  claimed: t.Boolean(),
  hasStaff: t.Boolean(),
  reason: t.String(),
  staff: t.Optional(Staff),
});

export const StaffCreateRequest = t.Object({
  merchantId: t.String(),
  name: t.String({ minLength: 1, maxLength: 100 }),
  pin: t.String({ minLength: 6, maxLength: 6 }),
  role: t.Optional(t.String()),
  outletId: t.Optional(t.String()),
});

export const StaffCreateResponse = t.Object({
  staff: Staff,
});

export const StaffListRequest = t.Object({
  merchantId: t.String(),
});

export const StaffListResponse = t.Object({
  staff: t.Array(Staff),
});

export const StaffUpdatePinRequest = t.Object({
  id: t.String(),
  pin: t.String({ minLength: 6, maxLength: 6 }),
});

export const StaffUpdatePinResponse = t.Object({
  staff: Staff,
});

export const StaffDeleteRequest = t.Object({
  id: t.String(),
});

export const DeleteResponse = t.Object({
  success: t.Boolean(),
});

export type Staff = typeof Staff.static;
export type StaffCurrentRequest = typeof StaffCurrentRequest.static;
export type StaffCurrentResponse = typeof StaffCurrentResponse.static;
export type StaffCreateRequest = typeof StaffCreateRequest.static;
export type StaffCreateResponse = typeof StaffCreateResponse.static;
export type StaffListRequest = typeof StaffListRequest.static;
export type StaffListResponse = typeof StaffListResponse.static;
export type StaffUpdatePinRequest = typeof StaffUpdatePinRequest.static;
export type StaffUpdatePinResponse = typeof StaffUpdatePinResponse.static;
export type StaffDeleteRequest = typeof StaffDeleteRequest.static;
export type DeleteResponse = typeof DeleteResponse.static;
