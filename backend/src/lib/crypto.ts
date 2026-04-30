/**
 * AES-256-GCM symmetric encryption helpers for at-rest secrets.
 *
 * Used for `User.twoFASecret` (Phase 1 wrap-up, Task 1). The TOTP shared
 * secret is sensitive — a DB dump leak should not be enough to clone every
 * authenticator. Encrypting it with a key held only in app config closes
 * that gap.
 *
 * Wire format (string):
 *
 *   v1:<iv-hex>:<tag-hex>:<ciphertext-hex>
 *
 * `v1` is a literal version tag so we can rotate algorithms in place
 * without a database migration. `iv` is 12 bytes (recommended for GCM),
 * `tag` is the 16-byte authentication tag, and `ciphertext` is the
 * AES-256-GCM output. Decryption rejects on tag mismatch.
 *
 * LEGACY FALLBACK (one-phase only):
 *   `decryptString` accepts values that don't begin with `v1:` and treats
 *   them as plaintext. This is a transitional convenience so users with
 *   already-enrolled authenticators don't get locked out the moment we
 *   roll out encryption — their secret is re-encrypted on the next
 *   `/2fa/verify`. Remove this fallback in Phase 2 once we're confident
 *   every active 2FA secret has been touched at least once.
 */
import crypto from "crypto";
import { requireEnv } from "./env.js";

const VERSION = "v1";
const ALGO = "aes-256-gcm";
const IV_LEN = 12; // 96 bits — GCM standard
const KEY_LEN = 32; // 256 bits

let _keyCache: Buffer | null = null;

function getKey(): Buffer {
  if (_keyCache) return _keyCache;
  const hex = requireEnv("TWOFA_ENCRYPTION_KEY");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "TWOFA_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)"
    );
  }
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== KEY_LEN) {
    throw new Error("TWOFA_ENCRYPTION_KEY decoded to wrong length");
  }
  _keyCache = buf;
  return buf;
}

/**
 * Reset the cached key. TEST-ONLY — call between tests that swap the env
 * var. No-op in production paths.
 */
export function _resetKeyCacheForTests(): void {
  _keyCache = null;
}

/**
 * Encrypt `plaintext` with AES-256-GCM using the configured key.
 * Output is a `v1:`-prefixed string suitable for direct DB storage.
 */
export function encryptString(plaintext: string): string {
  if (typeof plaintext !== "string") {
    throw new TypeError("encryptString requires a string");
  }
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("hex")}`;
}

/**
 * Decrypt a value produced by `encryptString`. Throws on tag mismatch
 * (tampering / wrong key) or malformed input.
 *
 * If the input does not start with `v1:`, returns it verbatim — see the
 * LEGACY FALLBACK note at the top of this file. This branch is
 * intentionally permissive for one phase.
 */
export function decryptString(value: string): string {
  if (typeof value !== "string") {
    throw new TypeError("decryptString requires a string");
  }

  // Legacy plaintext pass-through. Anything missing the version prefix is
  // assumed to be a pre-encryption row. Re-encryption happens on the next
  // write (see auth.ts:/2fa/verify).
  if (!value.startsWith(`${VERSION}:`)) {
    return value;
  }

  const parts = value.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("decryptString: malformed ciphertext envelope");
  }
  const [, ivHex, tagHex, ctHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const ct = Buffer.from(ctHex, "hex");
  if (iv.length !== IV_LEN || tag.length !== 16 || ct.length === 0) {
    throw new Error("decryptString: invalid component lengths");
  }
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/**
 * Returns true when `value` is a `v1:` ciphertext envelope produced by
 * this module. Useful for migration-on-write decisions.
 */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(`${VERSION}:`);
}
