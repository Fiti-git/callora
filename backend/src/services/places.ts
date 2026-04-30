import axios from "axios";
import { Sentry, sentryEnabled } from "../lib/sentry.js";
import { meterAndCharge } from "../lib/quota.js";

export interface Lead {
  id: string;
  name: string;
  address: string;
  phone?: string;
  rating?: number;
  openNow?: boolean;
}

export class PlacesService {
  private apiKey: string;
  private baseUrl = "https://places.googleapis.com/v1/places:searchText";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Search Google Places for businesses matching `query`. When `organizationId`
   * is supplied (the new path), each returned result is metered against the
   * org's PLACES quota via `meterAndCharge` BEFORE returning to the caller.
   * Throws QuotaExceededError on overage; the request handler maps that to
   * HTTP 429.
   */
  async findLeads(query: string, organizationId?: string): Promise<Lead[]> {
    if (!this.apiKey) {
      throw new Error("Google Maps API Key is missing for this organization.");
    }

    try {
      const response = await axios.post(
        this.baseUrl,
        {
          textQuery: query,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": this.apiKey,
            "X-Goog-FieldMask":
              "places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.rating,places.userRatingCount,places.id,places.currentOpeningHours,places.types",
          },
        }
      );

      const results = (response.data.places || []).map((place: any) => ({
        id: place.id,
        name: place.displayName?.text,
        address: place.formattedAddress,
        phone: place.internationalPhoneNumber,
        rating: place.rating,
        userRatingCount: place.userRatingCount,
        types: place.types,
        openNow: place.currentOpeningHours?.openNow,
      }));

      // Charge the org for the Places lookups we just performed. We meter
      // returned results (not requested limits) so empty searches don't
      // cost quota. Throws QuotaExceededError on overage.
      if (organizationId && results.length > 0) {
        await meterAndCharge(organizationId, "PLACES", results.length);
      }

      return results;
    } catch (error: any) {
      // QuotaExceededError must propagate so routes return 429 — never
      // wrap it in the generic "Places API failed" message.
      if (error?.name === "QuotaExceededError") throw error;
      if (sentryEnabled) {
        Sentry.captureException(error, {
          tags: { component: "places", kind: "google-places-search" },
        });
      }
      console.error("Places API Error:", error.response?.data || error.message);
      // In SaaS, we propagate the error so the UI sees it (e.g. Invalid Key)
      throw new Error(
        `Google Places API Failed: ${
          error.response?.data?.error?.message || error.message
        }`
      );
    }
  }
}
