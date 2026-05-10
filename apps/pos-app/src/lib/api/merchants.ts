import { Empty } from "@repo/protobuf/common";
import {
  MerchantCreateRequest,
  MerchantCreateResponse,
  MerchantListResponse,
} from "@repo/protobuf/merchants";
import { protoFetch } from "./client";

export const merchantsApi = {
  list: () =>
    protoFetch(
      "api/merchants/list",
      { req: Empty, res: MerchantListResponse },
      {}
    ),
  create: (payload: MerchantCreateRequest) =>
    protoFetch(
      "api/merchants/create",
      { req: MerchantCreateRequest, res: MerchantCreateResponse },
      payload
    ),
};
