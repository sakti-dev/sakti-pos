import { describe, expect, test } from "bun:test";
import { SyncStatusRequest, SyncStatusResponse } from "@repo/protobuf/sync";
import { Elysia } from "elysia";
import { tsProtoCodec, tsProtoPlugin } from "../ts-proto-plugin";

describe("tsProtoPlugin", () => {
  test("decodes protobuf request bodies and encodes protobuf responses", async () => {
    const app = new Elysia()
      .use(tsProtoPlugin)
      .post(
        "/status",
        ({ body }) => {
          const request = body as SyncStatusRequest;
          return {
            changedTables: [request.outletId],
            hasChanges: true,
            cursor: request.cursor,
            serverTime: "2026-05-17T00:00:00.000Z",
          };
        },
        {
          proto: {
            req: tsProtoCodec(SyncStatusRequest),
            res: tsProtoCodec(SyncStatusResponse),
          },
        }
      )
      .compile();

    const requestBody = SyncStatusRequest.encode(
      SyncStatusRequest.create({
        cursor: "sync:10:products:product-1",
        outletId: "outlet-1",
      })
    ).finish();

    const response = await app.handle(
      new Request("http://localhost/status", {
        body: requestBody,
        headers: { "Content-Type": "application/x-protobuf" },
        method: "POST",
      })
    );
    const decoded = SyncStatusResponse.decode(
      new Uint8Array(await response.arrayBuffer())
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain(
      "application/x-protobuf"
    );
    expect(decoded.cursor).toBe("sync:10:products:product-1");
    expect(decoded.changedTables).toEqual(["outlet-1"]);
  });

  test("returns 400 for malformed protobuf request bodies", async () => {
    const app = new Elysia()
      .use(tsProtoPlugin)
      .post(
        "/status",
        () => ({ cursor: "", hasChanges: false, serverTime: "" }),
        {
          proto: {
            req: tsProtoCodec(SyncStatusRequest),
            res: tsProtoCodec(SyncStatusResponse),
          },
        }
      )
      .compile();

    const response = await app.handle(
      new Request("http://localhost/status", {
        body: new Uint8Array([255, 255, 255]),
        headers: { "Content-Type": "application/x-protobuf" },
        method: "POST",
      })
    );

    expect(response.status).toBe(400);
  });
});
