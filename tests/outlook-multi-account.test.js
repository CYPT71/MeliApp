import test from "node:test";
import assert from "node:assert/strict";

import { accountIdentityFromTokens, decodeCalendarRef, encodeCalendarRef } from "../js/services/outlook.js";

const fakeJwt = (claims) => `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;

test("calendar refs preserve both the Microsoft account and calendar id", () => {
  const encoded = encodeCalendarRef("account:a@school.example", "calendar/id + 42");
  assert.deepEqual(decodeCalendarRef(encoded), {
    accountId: "account:a@school.example",
    calendarId: "calendar/id + 42"
  });
});

test("legacy calendar refs fall back to the active account", () => {
  assert.deepEqual(decodeCalendarRef("legacy-calendar", "account-1"), {
    accountId: "account-1",
    calendarId: "legacy-calendar"
  });
});

test("Microsoft identity is derived from the OpenID id token without exposing tokens", () => {
  const identity = accountIdentityFromTokens({
    id_token: fakeJwt({
      oid: "user-object-id",
      tid: "tenant-id",
      name: "Ada Lovelace",
      preferred_username: "ada@example.test"
    })
  });
  assert.deepEqual(identity, {
    id: "user-object-id",
    tenantId: "tenant-id",
    name: "Ada Lovelace",
    email: "ada@example.test"
  });
  assert.equal("accessToken" in identity, false);
  assert.equal("refreshToken" in identity, false);
});
