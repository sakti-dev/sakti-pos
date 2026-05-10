import ky from "ky";
import { AuthStorage } from "~/lib/auth/storage";
import { API_URL } from "~/lib/http";

export const api = ky.create({
  baseUrl: API_URL,
  retry: 2,
  hooks: {
    beforeRequest: [
      async ({ request }) => {
        const token = await AuthStorage.getToken();
        if (token) {
          request.headers.set("Authorization", `Bearer ${token}`);
        }
      },
    ],
  },
});

export interface ProtoMessage<T> {
  decode(input: Uint8Array, length?: number): T;
  encode(message: T, writer?: unknown): { finish(): Uint8Array };
}

export async function protoFetch<Req, Res>(
  endpoint: string,
  schemas: { req: ProtoMessage<Req>; res: ProtoMessage<Res> },
  payload: Req
): Promise<Res> {
  const binaryBody = schemas.req.encode(payload).finish();
  const body = new ArrayBuffer(binaryBody.byteLength);
  new Uint8Array(body).set(binaryBody);

  const response = await api.post(endpoint, {
    body,
    headers: {
      Accept: "application/x-protobuf",
      "Content-Type": "application/x-protobuf",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  return schemas.res.decode(new Uint8Array(await response.arrayBuffer()));
}
