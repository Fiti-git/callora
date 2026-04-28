import axios from "axios";

export interface ProvisionedNumber {
  id: string;        // Vapi phone-number object ID
  number: string;    // E.164 e.g. "+14155551234"
}

/**
 * Handles programmatic Vapi phone-number lifecycle.
 *
 * Uses the Vapi platform key (same one used for calls) — no extra credentials
 * are required from tenants.
 */
export class VapiProvisioningService {
  private baseUrl = "https://api.vapi.ai";
  private privateKey: string;

  constructor(privateKey: string) {
    this.privateKey = privateKey;
  }

  /**
   * Buy a new Vapi-managed phone number and return its ID + E.164 string.
   *
   * @param orgName   Human label stored in Vapi dashboard (helps identify per-tenant)
   * @param areaCode  US/CA area code preference. Vapi falls back to any available
   *                  if the requested area code has no inventory.
   */
  async buyPhoneNumber(
    orgName: string,
    areaCode = "415"
  ): Promise<ProvisionedNumber> {
    const response = await axios.post(
      `${this.baseUrl}/phone-number`,
      {
        provider: "vapi",
        areaCode,
        name: `Callora – ${orgName.slice(0, 40)}`,
      },
      {
        headers: {
          Authorization: `Bearer ${this.privateKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const { id, number } = response.data as { id: string; number: string };
    if (!id || !number) {
      throw new Error(
        `Vapi returned unexpected shape: ${JSON.stringify(response.data)}`
      );
    }
    return { id, number };
  }

  /**
   * Release (delete) a Vapi phone number when an org is cancelled / churned.
   * Safe to call even if the number was already deleted (404 is swallowed).
   */
  async releasePhoneNumber(phoneNumberId: string): Promise<void> {
    try {
      await axios.delete(`${this.baseUrl}/phone-number/${phoneNumberId}`, {
        headers: { Authorization: `Bearer ${this.privateKey}` },
      });
    } catch (err: any) {
      if (err?.response?.status === 404) return; // already gone
      throw err;
    }
  }
}
