import { Elysia } from "elysia";

const PROTOBUF_CONTENT_TYPE = "application/x-protobuf";

export interface TsProtoClass<T> {
  decode(input: Uint8Array, length?: number): T;
  encode(message: T, writer?: unknown): { finish(): Uint8Array };
}

interface ProtoSchemas {
  req?: TsProtoClass<unknown>;
  res?: TsProtoClass<unknown>;
}

export function tsProtoCodec<T>(schema: TsProtoClass<T>): TsProtoClass<T> {
  return {
    decode: schema.decode,
    encode: schema.encode,
  };
}

export const tsProtoPlugin = new Elysia({ name: "elysia-ts-proto" })
  .onParse(({ contentType, request }) => {
    if (contentType === PROTOBUF_CONTENT_TYPE) {
      return request.arrayBuffer();
    }
  })
  .macro({
    proto(schemas: ProtoSchemas) {
      return {
        async parse(context, contentType) {
          if (contentType !== PROTOBUF_CONTENT_TYPE || !schemas.req) {
            return;
          }

          try {
            const body = await context.request.arrayBuffer();
            return schemas.req.decode(new Uint8Array(body));
          } catch {
            throw Object.assign(new Error("Invalid Protobuf payload"), {
              status: 400,
            });
          }
        },
        mapResponse(context) {
          const status =
            typeof context.set.status === "number" ? context.set.status : 200;
          if (!schemas.res || context.responseValue == null || status >= 400) {
            return;
          }

          context.set.headers["Content-Type"] = PROTOBUF_CONTENT_TYPE;
          const binary = schemas.res.encode(context.responseValue).finish();
          return new Response(binary, {
            headers: context.set.headers as HeadersInit,
            status,
          });
        },
      };
    },
  });
