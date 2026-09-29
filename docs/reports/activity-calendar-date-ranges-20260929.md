# Activity calendar date ranges

Activity uses the shared Select and localized “Activity date range” label. Days, Weeks, Months and Custom groups contain only historical ranges admitted by the published maxRangeDays. The initial Last N days selection uses defaultRangeDays. There is no unselected placeholder.

The API description advertises supportsCalendarRanges. Older APIs retain days-only requests and presets. New requests carry period, timeZone, and (for custom) startDate/endDate alongside the existing days parameter. All four page endpoints—Timeline, Audit log, Versions and Saved snapshots—use the same server range resolver before querying their existing authorized sources. No DDL or entity enrollment changes.

Calendar dates use the effective localization timezone, displayed beside the control. Weeks start Monday. Last N days includes today and the preceding N−1 civil days. This week/month ends at the request instant; completed periods end at the last PostgreSQL microsecond before the next local day. Custom start/end dates are inclusive. Validation rejects invalid dates/timezones, reversed dates, future dates and spans exceeding the published maximum calendar-day count. Daylight-saving days need not be 24 hours.

Signed cursors bind the period, timezone and custom dates and retain the original resolved window across pagination. Relative periods resolve again for a new query/refresh. URL state preserves activityPeriod/activityDays/activityStart/activityEnd across tab, side/full and browser-history navigation. Unapplied custom edits do not change the active query.

Validation includes Gregorian month/year boundaries, timezone offsets, short and long DST days, custom validation, HTTP input filtering, cursor tampering, legacy API capability gating, localization, narrow layouts and existing Activity comparison/capture behavior.
