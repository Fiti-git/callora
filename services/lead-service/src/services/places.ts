import axios from "axios";
import { meterAndCharge, timeVendorCall, logger } from "@callora/shared";
import { getServiceSecret } from "../config.js";
import { CircuitBreaker } from "../lib/circuitBreaker.js";

export interface Lead {
  id: string;
  name: string;
  address: string;
  phone?: string;
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  openNow?: boolean;
}

interface PlaceApiResult {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  currentOpeningHours?: { openNow?: boolean };
}

const BASE_URL = "https://places.googleapis.com/v1/places:searchText";

// Singleton breaker scoped to the Places vendor.
const placesBreaker = new CircuitBreaker("google-places");

let cachedKey: string | null = null;
async function loadKey(): Promise<string> {
  if (cachedKey) return cachedKey;
  const key = await getServiceSecret("GOOGLE_MAPS_API_KEY");
  if (!key) {
    throw new Error("GOOGLE_MAPS_API_KEY is not configured for the platform.");
  }
  cachedKey = key;
  return key;
}

export class PlacesService {
  /**
   * When `organizationId` is supplied, every returned result is metered
   * against the org's PLACES quota via `meterAndCharge`. Throws
   * QuotaExceededError on overage and VendorUnavailableError when the
   * Places circuit breaker is OPEN.
   */
  async findLeads(query: string, organizationId?: string): Promise<Lead[]> {
    const apiKey = await loadKey();

    const response = await placesBreaker.exec(() =>
      timeVendorCall("google-places", "searchText", async () => {
      try {
        return await axios.post(
          BASE_URL,
          { textQuery: query },
          {
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": apiKey,
              "X-Goog-FieldMask":
                "places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.rating,places.userRatingCount,places.id,places.currentOpeningHours,places.types",
            },
          }
        );
      } catch (error) {
        const err = error as { response?: { data?: { error?: { message?: string } } }; message?: string };
        const msg =
          err.response?.data?.error?.message ?? err.message ?? "unknown error";
        // Don't log the response wholesale — it can leak the key in some
        // failure modes. Log only the sanitized message.
        logger.error({ err: msg }, "[lead-service] Places API error");
        throw new Error(`Google Places API failed: ${msg}`);
      }
      })
    );

    const places: PlaceApiResult[] = response.data?.places ?? [];
    const results: Lead[] = places.map((place) => ({
      id: place.id,
      name: place.displayName?.text ?? "",
      address: place.formattedAddress ?? "",
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
  }
}
