import { DeleteResponse } from "@repo/protobuf/common";
import {
  RegisterCreateRequest,
  RegisterCreateResponse,
  RegisterDeleteRequest,
  RegisterListRequest,
  RegisterListResponse,
  RegisterPairRequest,
  RegisterPairResponse,
} from "@repo/protobuf/registers";
import { protoFetch } from "./client";

export const registersApi = {
  pair: (payload: RegisterPairRequest) =>
    protoFetch(
      "api/registers/pair",
      { req: RegisterPairRequest, res: RegisterPairResponse },
      payload
    ),
  create: (payload: RegisterCreateRequest) =>
    protoFetch(
      "api/registers/create",
      { req: RegisterCreateRequest, res: RegisterCreateResponse },
      payload
    ),
  list: (payload: RegisterListRequest) =>
    protoFetch(
      "api/registers/list",
      { req: RegisterListRequest, res: RegisterListResponse },
      payload
    ),
  delete: (payload: RegisterDeleteRequest) =>
    protoFetch(
      "api/registers/delete",
      { req: RegisterDeleteRequest, res: DeleteResponse },
      payload
    ),
};
