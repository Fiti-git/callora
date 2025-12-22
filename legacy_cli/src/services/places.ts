import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

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

  constructor() {
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY || "";
    if (!this.apiKey) {
      console.warn("⚠️ GOOGLE_MAPS_API_KEY is missing! Using Mock Data.");
    }
  }

  async findLeads(query: string): Promise<Lead[]> {
    if (!this.apiKey) {
      return this.getMockLeads(query);
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
              "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.id,places.currentOpeningHours",
          },
        }
      );

      return (response.data.places || []).map((place: any) => ({
        id: place.id,
        name: place.displayName?.text,
        address: place.formattedAddress,
        phone: place.nationalPhoneNumber,
        rating: place.rating,
        openNow: place.currentOpeningHours?.openNow,
      }));
    } catch (error) {
      console.error("Places API Error (falling back to mock):", error);
      return this.getMockLeads(query);
    }
  }

  private getMockLeads(query: string): Lead[] {
    console.log(`[Mock] Generating leads for query: "${query}"`);
    return [
      {
        id: "mock-1",
        name: "Acme " + query + " Service",
        address: "123 Main St, Tech City",
        phone: "(555) 010-1010",
        rating: 4.5,
        openNow: true,
      },
      {
        id: "mock-2",
        name: "Best " + query + " Solutions",
        address: "456 Market Ave, Biz Town",
        phone: "(555) 020-2020",
        rating: 4.0,
        openNow: false,
      },
      {
        id: "mock-3",
        name: "Old School " + query,
        address: "789 History Ln, Old Town",
        phone: "(555) 030-3030", // Intentionally simulates a grumpier lead
        rating: 3.2,
        openNow: true,
      },
    ];
  }
}
