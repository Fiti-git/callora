-- Add 2FA (TOTP) columns to User. Phase 1, Agent 3 (auth hardening).
--
-- twoFASecret         : base32 TOTP secret. Nullable. Stored unencrypted at
--                       this stage; flagged for at-rest encryption upgrade.
-- twoFAEnabled        : flips to true only after the user successfully verifies
--                       a TOTP token during the setup flow.
-- twoFARecoveryCodes  : 10 sha256-hashed single-use recovery codes. We splice
--                       used codes out of the array on consumption.

ALTER TABLE "User" ADD COLUMN "twoFASecret" TEXT;
ALTER TABLE "User" ADD COLUMN "twoFAEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "twoFARecoveryCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
