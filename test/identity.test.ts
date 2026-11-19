import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { originAllowed } from "../src/chat.ts";
import { parseFrom } from "../src/email.ts";
import type { Env } from "../src/env.ts";
import { IDENTITY_MAX_AGE, identityPayload, verifyIdentity } from "../src/security.ts";

const SECRET = "test-secret-0123456789abcdef";
const env = { IDENTITY_SECRET: SECRET } as Env;
const NOW = 1_800_000_000;

/** Signs the way a host app's server does (here: Node's crypto, as in a Next.js route). */
function sign(email: string, userId: string, issuedAt: number, secret = SECRET) {
  const signature = createHmac("sha256", secret).update(identityPayload(email, userId, issuedAt)).digest("hex");
  return { email, userId, name: "Ana Silva", issuedAt, signature };
}

test("a correctly signed identity is accepted, with its email and name", async () => {
  assert.deepEqual(await verifyIdentity(env, sign("ana@example.com", "u1", NOW), NOW), { email: "ana@example.com", name: "Ana Silva" });
});

test("the email is matched case-insensitively", async () => {
  const id = sign("ana@example.com", "u1", NOW);
  assert.deepEqual(await verifyIdentity(env, { ...id, email: "Ana@Example.com" }, NOW), { email: "ana@example.com", name: "Ana Silva" });
});

test("a tampered, wrongly signed or expired identity is refused", async () => {
  const id = sign("ana@example.com", "u1", NOW);
  assert.equal(await verifyIdentity(env, { ...id, email: "bob@example.com" }, NOW), null);
  assert.equal(await verifyIdentity(env, { ...id, userId: "u2" }, NOW), null);
  assert.equal(await verifyIdentity(env, sign("ana@example.com", "u1", NOW, "another-secret-0123456789"), NOW), null);
  assert.equal(await verifyIdentity(env, id, NOW + IDENTITY_MAX_AGE + 1), null);
  assert.equal(await verifyIdentity(env, id, NOW - 3600), null, "issued too far in the future");
});

test("without a secret, or with junk, nothing is accepted", async () => {
  assert.equal(await verifyIdentity({} as Env, sign("ana@example.com", "u1", NOW), NOW), null);
  assert.equal(await verifyIdentity(env, null, NOW), null);
  assert.equal(await verifyIdentity(env, { email: "not-an-email", userId: "u1", issuedAt: NOW, signature: "x" }, NOW), null);
  assert.equal(await verifyIdentity(env, { ...sign("ana@example.com", "u1", NOW), issuedAt: String(NOW) }, NOW), null);
});

test("sender addresses are split into name and email for Brevo", () => {
  assert.deepEqual(parseFrom("StartAbroad Support <help@startabroad.com>"), { name: "StartAbroad Support", email: "help@startabroad.com" });
  assert.deepEqual(parseFrom("help@startabroad.com"), { email: "help@startabroad.com" });
  assert.deepEqual(parseFrom('"Support" <help@startabroad.com>'), { name: "Support", email: "help@startabroad.com" });
});

test("allowed sites: any site when unset, otherwise only the list and the Worker itself", () => {
  const req = new Request("https://chat.example.workers.dev/api/config");
  assert.equal(originAllowed({} as Env, req, "https://anything.com"), true);
  const limited = { ALLOWED_ORIGINS: "https://app.startabroad.com, https://staging.startabroad.com" } as Env;
  assert.equal(originAllowed(limited, req, "https://app.startabroad.com"), true);
  assert.equal(originAllowed(limited, req, "https://app.startabroad.com/portugal/dashboard?x=1"), true);
  assert.equal(originAllowed(limited, req, "https://evil.example.com"), false);
  assert.equal(originAllowed(limited, req, "https://chat.example.workers.dev"), true);
  assert.equal(originAllowed(limited, req, null), true, "same-origin requests carry no Origin header");
  assert.equal(originAllowed(limited, req, "not a url"), false);
});
