import axios from "axios";

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

  async findLeads(query: string): Promise<Lead[]> {
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

      return (response.data.places || []).map((place: any) => ({
        id: place.id,
        name: place.displayName?.text,
        address: place.formattedAddress,
        phone: place.internationalPhoneNumber,
        rating: place.rating,
        userRatingCount: place.userRatingCount,
        types: place.types,
        openNow: place.currentOpeningHours?.openNow,
      }));
    } catch (error: any) {
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
