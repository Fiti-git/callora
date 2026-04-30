import axios from "axios";
import { meterAndCharge } from "@callora/shared";

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
   * When `organizationId` is supplied, every returned result is metered
   * against the org's PLACES quota via `meterAndCharge`. Throws
   * QuotaExceededError on overage.
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

      if (organizationId && results.length > 0) {
        await meterAndCharge(organizationId, "PLACES", results.length);
      }

      return results;
    } catch (error: any) {
      if (error?.name === "QuotaExceededError") throw error;
      console.error("Places API Error:", error.response?.data || error.message);
      throw new Error(
        `Google Places API Failed: ${
          error.response?.data?.error?.message || error.message
        }`
      );
    }
  }
}
