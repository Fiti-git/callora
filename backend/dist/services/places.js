import axios from "axios";
export class PlacesService {
    constructor(apiKey) {
        this.baseUrl = "https://places.googleapis.com/v1/places:searchText";
        this.apiKey = apiKey;
    }
    async findLeads(query) {
        if (!this.apiKey) {
            throw new Error("Google Maps API Key is missing for this organization.");
        }
        try {
            const response = await axios.post(this.baseUrl, {
                textQuery: query,
            }, {
                headers: {
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": this.apiKey,
                    "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.id,places.currentOpeningHours",
                },
            });
            return (response.data.places || []).map((place) => ({
                id: place.id,
                name: place.displayName?.text,
                address: place.formattedAddress,
                phone: place.nationalPhoneNumber,
                rating: place.rating,
                openNow: place.currentOpeningHours?.openNow,
            }));
        }
        catch (error) {
            console.error("Places API Error:", error.response?.data || error.message);
            // In SaaS, we propagate the error so the UI sees it (e.g. Invalid Key)
            throw new Error(`Google Places API Failed: ${error.response?.data?.error?.message || error.message}`);
        }
    }
}
