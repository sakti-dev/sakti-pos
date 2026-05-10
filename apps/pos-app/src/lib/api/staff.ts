import { DeleteResponse } from "@repo/protobuf/common";
import {
  StaffCreateRequest,
  StaffCreateResponse,
  StaffCurrentRequest,
  StaffCurrentResponse,
  StaffDeleteRequest,
  StaffListRequest,
  StaffListResponse,
  StaffUpdatePinRequest,
  StaffUpdatePinResponse,
} from "@repo/protobuf/staff";
import { protoFetch } from "./client";

export const staffApi = {
  current: (payload: StaffCurrentRequest) =>
    protoFetch(
      "api/staff/current",
      { req: StaffCurrentRequest, res: StaffCurrentResponse },
      payload
    ),
  create: (payload: StaffCreateRequest) =>
    protoFetch(
      "api/staff/create",
      { req: StaffCreateRequest, res: StaffCreateResponse },
      payload
    ),
  list: (payload: StaffListRequest) =>
    protoFetch(
      "api/staff/list",
      { req: StaffListRequest, res: StaffListResponse },
      payload
    ),
  updatePin: (payload: StaffUpdatePinRequest) =>
    protoFetch(
      "api/staff/update-pin",
      { req: StaffUpdatePinRequest, res: StaffUpdatePinResponse },
      payload
    ),
  delete: (payload: StaffDeleteRequest) =>
    protoFetch(
      "api/staff/delete",
      { req: StaffDeleteRequest, res: DeleteResponse },
      payload
    ),
};
