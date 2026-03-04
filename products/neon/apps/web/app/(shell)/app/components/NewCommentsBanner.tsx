"use client";

/**
 * New Comments Banner Props
 */
interface NewCommentsBannerProps {
  count: number;
  onRefresh: () => void;
  onDismiss?: () => void;
}

/**
 * New Comments Banner Component
 *
 * Displayed when new comments arrive via SSE.
 * Allows users to refresh the comment list to see new comments.
 */
export function NewCommentsBanner({ count, onRefresh, onDismiss }: NewCommentsBannerProps) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-center justify-between animate-slide-down">
      <div className="flex items-center gap-2">
        <svg
          className="w-5 h-5 text-blue-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
          />
        </svg>
        <span className="text-sm font-medium text-blue-900">
          {count === 1 ? "1 new comment" : `${count} new comments`} available
        </span>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRefresh}
          className="px-3 py-1 text-sm font-medium text-blue-700 bg-white border border-blue-300 rounded hover:bg-blue-50 transition-colors"
        >
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh
          </span>
        </button>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-blue-600 hover:text-blue-800"
            title="Dismiss"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
