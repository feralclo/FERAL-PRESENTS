import { describe, expect, it } from "vitest";
import * as crypto from "crypto";
import {
  buildApnsEnvelope,
  mapApnsResponse,
  mintApnsJwt,
} from "@/lib/push/apns";

// Generate a throwaway P-256 key pair per test run. These keys never touch
// Apple — they exist only so we can sign and verify JWTs locally.
function makeP256KeyPair() {
  return crypto.generateKeyPairSync("ec", {
    namedCurve: "P-256",
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function decodeBase64Url<T = unknown>(input: string): T {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as T;
}

describe("buildApnsEnvelope", () => {
  it("includes the canonical aps fields and the rep notification type", () => {
    const env = buildApnsEnvelope({
      type: "quest_approved",
      title: "Quest approved",
      body: "+50 XP",
    });
    expect(env.aps.alert).toEqual({ title: "Quest approved", body: "+50 XP" });
    expect(env.aps.sound).toBe("default");
    expect(env.aps["mutable-content"]).toBe(1);
    expect(env.type).toBe("quest_approved");
  });

  it("omits body, deep_link, and data when not provided", () => {
    const env = buildApnsEnvelope({
      type: "general",
      title: "Hello",
    });
    expect(env.aps.alert).toEqual({ title: "Hello" });
    expect("body" in env.aps.alert).toBe(false);
    expect("deep_link" in env).toBe(false);
    expect("data" in env).toBe(false);
  });

  it("passes deep_link and data through verbatim", () => {
    const env = buildApnsEnvelope({
      type: "event_reminder",
      title: "Tomorrow",
      body: "venue, city",
      deep_link: "entry://events/abc",
      data: { event_id: "abc", kind: "24h" },
    });
    expect(env.deep_link).toBe("entry://events/abc");
    expect(env.data).toEqual({ event_id: "abc", kind: "24h" });
  });
});

describe("mintApnsJwt", () => {
  it("produces a three-part token with ES256 header and team/key claims", () => {
    const { privateKey } = makeP256KeyPair();
    const jwt = mintApnsJwt({
      keyPem: privateKey,
      keyId: "9FR6S6HUQ5",
      teamId: "659HAXP9BP",
      nowSec: 1_700_000_000,
    });
    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);
    const header = decodeBase64Url<{ alg: string; kid: string; typ: string }>(
      parts[0],
    );
    const payload = decodeBase64Url<{ iss: string; iat: number }>(parts[1]);
    expect(header).toEqual({ alg: "ES256", kid: "9FR6S6HUQ5", typ: "JWT" });
    expect(payload).toEqual({ iss: "659HAXP9BP", iat: 1_700_000_000 });
  });

  it("produces an IEEE-P1363 64-byte signature that verifies against the public key", () => {
    const { publicKey, privateKey } = makeP256KeyPair();
    const jwt = mintApnsJwt({
      keyPem: privateKey,
      keyId: "TEST",
      teamId: "TEAMID",
    });
    const [headerB64, payloadB64, sigB64] = jwt.split(".");
    const signingInput = Buffer.from(`${headerB64}.${payloadB64}`);
    const signature = Buffer.from(
      sigB64.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    );
    expect(signature.byteLength).toBe(64);
    const ok = crypto.verify(
      "SHA256",
      signingInput,
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      signature,
    );
    expect(ok).toBe(true);
  });
});

describe("mapApnsResponse", () => {
  it("maps 200 to sent", () => {
    expect(mapApnsResponse(200, undefined, 42)).toEqual({
      status: "sent",
      transport_response_ms: 42,
    });
  });

  it("maps 410 / Unregistered / BadDeviceToken to invalid_token", () => {
    expect(mapApnsResponse(410, "Unregistered", 10).status).toBe(
      "invalid_token",
    );
    expect(mapApnsResponse(400, "BadDeviceToken", 10).status).toBe(
      "invalid_token",
    );
    expect(mapApnsResponse(400, "DeviceTokenNotForTopic", 10).status).toBe(
      "invalid_token",
    );
  });

  it("flags provider-token issues as failed with auth-prefixed message", () => {
    const r = mapApnsResponse(403, "ExpiredProviderToken", 10);
    expect(r.status).toBe("failed");
    expect(r.error_message).toContain("apns auth");
    expect(r.error_message).toContain("ExpiredProviderToken");
  });

  it("falls back to a generic failed for unknown reasons", () => {
    const r = mapApnsResponse(500, undefined, 10);
    expect(r.status).toBe("failed");
    expect(r.error_message).toBe("apns 500");
  });
});
