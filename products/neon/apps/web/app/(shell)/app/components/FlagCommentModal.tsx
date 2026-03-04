"use client";

import { useState } from "react";

/**
 * Flag Reason Type
 */
type FlagReason = 'spam' | 'offensive' | 'harassment' | 'misinformation' | 'other';

/**
 * Flag Comment Modal Props
 */
interface FlagCommentModalProps {
  commentId: string;
  isOpen: boolean;
  onClose: () => void;
  onFlagSubmitted?: () => void;
}

/**
 * Flag Comment Modal Component
 *
 * Modal for users to flag inappropriate comments.
 */
export function FlagCommentModal({
  commentId,
  isOpen,
  onClose,
  onFlagSubmitted,
}: FlagCommentModalProps) {
  const [selectedReason, setSelectedReason] = useState<FlagReason>('spam');
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const flagReasons: Array<{ value: FlagReason; label: string; description: string }> = [
    { value: 'spam', label: 'Spam', description: 'Unwanted promotional content or repetitive messages' },
    { value: 'offensive', label: 'Offensive', description: 'Contains offensive or inappropriate language' },
    { value: 'harassment', label: 'Harassment', description: 'Harassing, threatening, or bullying behavior' },
    { value: 'misinformation', label: 'Misinformation', description: 'Contains false or misleading information' },
    { value: 'other', label: 'Other', description: 'Other policy violation (please provide details)' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedReason === 'other' && !details.trim()) {
      setError('Please provide details for "Other" reason');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/collab/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          commentId,
          flagReason: selectedReason,
          flagDetails: details || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit flag');
      }

      setSuccess(true);
      onFlagSubmitted?.();

      // Auto-close after 2 seconds
      setTimeout(() => {
        onClose();
        setSuccess(false);
        setDetails("");
        setSelectedReason('spam');
      }, 2000);
    } catch (err) {
      console.error('Flag submission error:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit flag');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Flag Comment</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {success ? (
          <div className="p-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 mb-2">Flag Submitted</h4>
            <p className="text-sm text-gray-600">Thank you for helping keep our community safe.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Body */}
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Please select the reason for flagging this comment. Our moderation team will review it.
              </p>

              {/* Reason Selection */}
              <div className="space-y-2">
                {flagReasons.map((reason) => (
                  <label
                    key={reason.value}
                    className={`flex items-start p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedReason === reason.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="flagReason"
                      value={reason.value}
                      checked={selectedReason === reason.value}
                      onChange={(e) => setSelectedReason(e.target.value as FlagReason)}
                      className="mt-1"
                    />
                    <div className="ml-3 flex-1">
                      <div className="font-medium text-sm text-gray-900">{reason.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{reason.description}</div>
                    </div>
                  </label>
                ))}
              </div>

              {/* Additional Details */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Additional Details {selectedReason === 'other' && <span className="text-red-600">*</span>}
                </label>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Provide more context (optional)"
                  rows={3}
                  maxLength={500}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
                <div className="text-xs text-gray-500 text-right mt-1">
                  {details.length}/500 characters
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-4 border-t bg-gray-50 rounded-b-lg">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting...' : 'Submit Flag'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
