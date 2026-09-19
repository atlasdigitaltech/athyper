/** Shared entity UI copy. Entity-specific labels remain in published metadata. */
export const entityEnglishMessages = Object.freeze({
  "validation.required": "{field} is required.",
  "validation.maxLength": "{field} must be {max} characters or fewer.",
  "validation.option": "Choose an available option for {field}.",
  "validation.url": "Enter a valid website URL for {field}.",
  "validation.number": "Enter a valid number for {field}.",
  "validation.value": "Enter a valid value for {field}.",
  "validation.summary": "Please correct the following fields.",

  "entity.overview.focus.title": "Focus",
  "entity.overview.focus.description": "Available work queues.",
  "entity.overview.focus.empty": "No work queues available",
  "entity.overview.focus.emptyDescription":
    "Work queues will appear here when available in your current scope.",
  "entity.overview.shortcuts.title": "Continue your work",
  "entity.overview.shortcuts.description": "Available record views.",
  "entity.overview.shortcuts.empty": "No record views available",
  "entity.overview.shortcuts.emptyDescription":
    "Record views will appear here when available in your current scope.",
  "entity.overview.recent.title": "Recently updated",
  "entity.overview.recent.preview": "Record preview",
  "entity.overview.recent.description":
    "The latest record updates in your current scope.",
  "entity.overview.recent.previewDescription":
    "Records available in your current scope.",
  "entity.overview.recent.empty": "No records available",
  "entity.overview.recent.emptyDescription":
    "There are no records to display in your current scope.",
  "entity.overview.recent.error": "Records couldn’t be loaded",
  "entity.overview.recent.errorDescription":
    "Refresh to try loading your records again.",
  "entity.overview.viewRecords": "View records",
  "entity.overview.browseRecords": "Browse records",
  "entity.overview.searchRecords": "Search, filter, and explore records",
  "entity.overview.openView": "Open view",
  "entity.overview.favourites.title": "Favourites",
  "entity.overview.favourites.description": "Records you have starred.",
  "entity.overview.favourites.empty": "No favourites yet",
  "entity.overview.favourites.emptyDescription":
    "Star a record to find it here.",
  "entity.reference.loading": "Loading choices…",
  "entity.reference.loadError": "Could not load choices.",
  "entity.reference.retry": "Retry",
  "entity.reference.search": "Search by name or code…",
  "entity.reference.recent": "Recently selected",
  "entity.reference.all": "All options",
  "entity.reference.results": "Search results",
  "entity.reference.empty": "No matching options. Try another name or code.",
  "entity.reference.unavailable": "No options available.",
  "entity.reference.required": "Select an available option.",
  "entity.reference.clear": "Clear selection",
  "entity.reference.clearRecent": "Clear recent choices",
  "entity.reference.browse": "Browse all…",
} as const);
