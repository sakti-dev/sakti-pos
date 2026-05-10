import {
  OutletCreateRequest,
  OutletCreateResponse,
  OutletListRequest,
  OutletListResponse,
  OutletUpdateRequest,
  OutletUpdateResponse,
} from "@repo/protobuf/outlets";
import { protoFetch } from "./client";

export const outletsApi = {
  list: (payload: OutletListRequest) =>
    protoFetch(
      "api/outlets/list",
      { req: OutletListRequest, res: OutletListResponse },
      payload
    ),
  create: (payload: OutletCreateRequest) =>
    protoFetch(
      "api/outlets/create",
      { req: OutletCreateRequest, res: OutletCreateResponse },
      payload
    ),
  update: (payload: OutletUpdateRequest) =>
    protoFetch(
      "api/outlets/update",
      { req: OutletUpdateRequest, res: OutletUpdateResponse },
      payload
    ),
};
