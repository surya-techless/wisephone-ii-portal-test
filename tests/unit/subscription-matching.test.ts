// tests/unit/subscription-matching.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeImei,
  stripeSubscriptionMatchesImei,
  gigsSubscriptionMatchesDevice
} from "../../src/libs/subscription-matching";
import type { Subscription, Device } from "../../src/libs/types";

describe("normalizeImei", () => {
  it("strips dashes, spaces, and letters", () => {
    assert.equal(normalizeImei("354-031-234-567-89"), "35403123456789");
    assert.equal(normalizeImei("354 031 234 567 89"), "35403123456789");
    assert.equal(normalizeImei("IMEI35403123456789"), "35403123456789");
  });

  it("returns empty string for empty input", () => {
    assert.equal(normalizeImei(""), "");
  });
});

describe("stripeSubscriptionMatchesImei", () => {
  const targetImei = "35403123456789";

  it("matches identical digits", () => {
    assert.equal(stripeSubscriptionMatchesImei({ imei: targetImei }, targetImei), true);
  });

  it("matches when metadata has formatted imei", () => {
    assert.equal(stripeSubscriptionMatchesImei({ imei: "35-403-123-456-789" }, targetImei), true);
  });

  it("does not match different imei", () => {
    assert.equal(stripeSubscriptionMatchesImei({ imei: "999999999999999" }, targetImei), false);
  });

  it("does not match empty or missing metadata", () => {
    assert.equal(stripeSubscriptionMatchesImei({}, targetImei), false);
    assert.equal(stripeSubscriptionMatchesImei(null, targetImei), false);
    assert.equal(stripeSubscriptionMatchesImei(undefined, targetImei), false);
    assert.equal(stripeSubscriptionMatchesImei({ imei: "" }, targetImei), false);
  });

  it("does not match when imei arg is empty", () => {
    assert.equal(stripeSubscriptionMatchesImei({ imei: targetImei }, ""), false);
  });
});

describe("gigsSubscriptionMatchesDevice", () => {
  const simId = "sim_123";
  const device = {
    sims: [{ id: simId }]
  } as Device;

  const baseSub = {
    sim: { id: simId }
  } as Subscription;

  it("returns true for active status with matching sim", () => {
    assert.equal(gigsSubscriptionMatchesDevice({ ...baseSub, status: "active" }, device), true);
  });

  it("returns true for pending status with matching sim", () => {
    assert.equal(gigsSubscriptionMatchesDevice({ ...baseSub, status: "pending" }, device), true);
  });

  it("returns false for canceled status even with matching sim", () => {
    assert.equal(gigsSubscriptionMatchesDevice({ ...baseSub, status: "canceled" }, device), false);
  });

  it("returns false for inactive status even with matching sim", () => {
    assert.equal(gigsSubscriptionMatchesDevice({ ...baseSub, status: "inactive" }, device), false);
  });

  it("returns false when sim id is not in device.sims", () => {
    assert.equal(
      gigsSubscriptionMatchesDevice({ ...baseSub, status: "active", sim: { id: "sim_other" } } as Subscription, device),
      false
    );
  });

  it("returns false for missing or null sim without throwing", () => {
    assert.equal(gigsSubscriptionMatchesDevice({ status: "active" } as Subscription, device), false);
    assert.equal(
      gigsSubscriptionMatchesDevice({ status: "active", sim: null } as unknown as Subscription, device),
      false
    );
  });

  it("returns false for empty or missing device.sims without throwing", () => {
    assert.equal(
      gigsSubscriptionMatchesDevice({ ...baseSub, status: "active" }, { sims: [] } as unknown as Device),
      false
    );
    assert.equal(gigsSubscriptionMatchesDevice({ ...baseSub, status: "active" }, {} as Device), false);
  });
});
