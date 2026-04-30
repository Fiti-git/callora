"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/components/ui/toast";
import { createList } from "@/app/actions/email-marketing";

const schema = z.object({
  name: z.string().min(1, "Required").max(200),
  description: z.string().max(2000).optional(),
});
type Values = z.infer<typeof schema>;

export default function NewListPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Values) {
    setSubmitting(true);
    try {
      const created = await createList({
        name: values.name,
        description: values.description || null,
      });
      showToast("success", "List created");
      router.push(`/email-marketing/lists/${created.id}`);
    } catch (err: any) {
      showToast("error", err?.message || "Failed to create list");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">New List</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          A list groups recipients to send campaigns to.
        </p>
      </div>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4"
      >
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
            Name
          </label>
          <input
            {...register("name")}
            className="block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {errors.name && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.name.message}</p>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
            Description (optional)
          </label>
          <textarea
            {...register("description")}
            rows={3}
            className="block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create list"}
          </button>
        </div>
      </form>
    </div>
  );
}
