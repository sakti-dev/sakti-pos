import { authApi } from "./auth";
import { merchantsApi } from "./merchants";
import { outletsApi } from "./outlets";
import { registersApi } from "./registers";
import { staffApi } from "./staff";

export const cloudApi = {
  auth: authApi,
  merchants: merchantsApi,
  outlets: outletsApi,
  registers: registersApi,
  staff: staffApi,
};
