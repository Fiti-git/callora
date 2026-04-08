"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { createNote, deleteNote } from "@/app/actions/notes";

const TYPE_CONFIG = {
  NOTE: {
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-600 dark:text-gray-400",
    label: "Note",
  },
  CALL: {
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    ),
    bg: "bg-blue-100 dark:bg-blue-500/20",
    text: "text-blue-600 dark:text-blue-400",
    label: "Call",
  },
  EMAIL: {
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    bg: "bg-blue-100 dark:bg-blue-500/20",
    text: "text-blue-600 dark:text-blue-400",
    label: "Email",
  },
  STATUS_CHANGE: {
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    ),
    bg: "bg-amber-100 dark:bg-amber-500/20",
    text: "text-amber-600 dark:text-amber-400",
    label: "Status Change",
  },
};

interface Note {
  id: string;
  content: string;
  type: string;
  createdAt: string;
  author: { id: string; name?: string; email: string };
}

interface ActivityTimelineProps {
  notes: Note[];
  contactId: string;
  leadId?: string;
}

export function ActivityTimeline({ notes, contactId, leadId }: ActivityTimelineProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setLoading(true);
    try {
      await createNote({ content, type: "NOTE", contactId, leadId });
      setContent("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(noteId: string) {
    if (!confirm("Delete this note?")) return;
    await deleteNote(noteId);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Add note form */}
      <form onSubmit={handleAddNote} className="flex gap-2">
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add a note…"
          className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={loading || !content.trim()}
          className="px-3 py-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "…" : "Add"}
        </button>
      </form>

      {/* Timeline */}
      {notes.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">No activity yet. Add a note above.</p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => {
            const config = TYPE_CONFIG[note.type as keyof typeof TYPE_CONFIG] || TYPE_CONFIG.NOTE;
            return (
              <div key={note.id} className="flex gap-3">
                <div className={`w-7 h-7 rounded-full ${config.bg} ${config.text} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  {config.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{config.label}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      by {note.author?.name || note.author?.email}
                    </span>
                    <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500" title={format(new Date(note.createdAt), "PPpp")}>
                      {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                    </span>
                    <button
                      onClick={() => handleDelete(note.id)}
                      className="ml-auto text-xs text-gray-300 dark:text-gray-600 hover:text-red-400 dark:hover:text-red-400 transition-colors"
                    >
                      ×
                    </button>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5 whitespace-pre-wrap">{note.content}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
