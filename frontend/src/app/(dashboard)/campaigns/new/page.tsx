"use client";

import { createCampaign } from "@/app/actions/campaign";
import { useRouter } from "next/navigation";
import { useState } from "react";

import toast from "react-hot-toast";

export default function NewCampaignPage() {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const campaign = await createCampaign(prompt, name);
      console.log("Client Received:", campaign);

      if (!campaign) {
        toast.error("Campaign object is null/undefined");
        return;
      }

      if (!campaign.id || campaign.id === "undefined") {
        toast.error(
          "Campaign ID is missing or invalid: " + JSON.stringify(campaign)
        );
        return;
      }

      toast.success("Campaign created! Redirecting to " + campaign.id);

      // Delay to ensure user sees success
      setTimeout(() => {
        router.push(`/campaigns/${campaign.id}`);
      }, 1000);
    } catch (error: any) {
      toast.error("Failed to create campaign: " + error.message);
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6">Create New Campaign</h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Campaign Name
          </label>
          <input
            type="text"
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
            placeholder="e.g. Q1 Sales Push - Austin Dentists"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Targeting Prompt
          </label>
          <p className="text-sm text-gray-500 mb-2">
            Describe who you want to find and contact.
          </p>
          <textarea
            required
            rows={4}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
            placeholder="e.g. Find commercial roofing companies in Miami with good reviews."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Campaign"}
          </button>
        </div>
      </form>
    </div>
  );
}
