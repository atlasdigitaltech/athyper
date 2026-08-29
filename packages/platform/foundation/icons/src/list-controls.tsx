import * as React from "react";
import { IconFrame, type IconProps } from "./icon";

export function FilterIcon(props: IconProps) { return <IconFrame {...props}><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3Z" /></IconFrame>; }
export function SortIcon(props: IconProps) { return <IconFrame {...props}><path d="m3 16 4 4 4-4M7 20V4M21 8l-4-4-4 4M17 4v16" /></IconFrame>; }
export function ColumnsIcon(props: IconProps) { return <IconFrame {...props}><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18M15 3v18" /></IconFrame>; }
export function MoreHorizontalIcon(props: IconProps) { return <IconFrame {...props}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></IconFrame>; }
/** Lucide SlidersHorizontal geometry for consolidated list controls. */
export function SlidersHorizontalIcon(props: IconProps) { return <IconFrame {...props}><path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" /></IconFrame>; }
export function GroupIcon(props: IconProps) { return <IconFrame {...props}><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /></IconFrame>; }
/** Lucide GripVertical geometry used by reorderable list controls. */
export function GripVerticalIcon(props: IconProps) { return <IconFrame {...props}><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></IconFrame>; }
export function LayoutIcon(props: IconProps) { return <IconFrame {...props}><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /></IconFrame>; }
export function DensityIcon(props: IconProps) { return <IconFrame {...props}><path d="M4 6h16M4 12h16M4 18h16" /></IconFrame>; }
export function SearchIcon(props: IconProps) { return <IconFrame {...props}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></IconFrame>; }
export function ResetIcon(props: IconProps) { return <IconFrame {...props}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></IconFrame>; }
export function SettingsIcon(props: IconProps) { return <IconFrame {...props}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" /><circle cx="12" cy="12" r="3" /></IconFrame>; }
export function TrashIcon(props: IconProps) { return <IconFrame {...props}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" /></IconFrame>; }
/** Lucide Building2 geometry, exposed through the platform icon boundary. */
export function Building2Icon(props: IconProps) { return <IconFrame {...props}><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M6 12H4a2 2 0 0 0-2 2v8M18 9h2a2 2 0 0 1 2 2v11M10 6h4M10 10h4M10 14h4M10 18h4M2 22h20" /></IconFrame>; }
/** Lucide RefreshCw geometry, exposed through the platform icon boundary. */
export function RefreshCwIcon(props: IconProps) { return <IconFrame {...props}><path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5M3 12A9 9 0 0 1 18 5.3L21 8M21 3v5h-5" /></IconFrame>; }
/** Lucide Download geometry, exposed through the platform icon boundary. */
export function DownloadIcon(props: IconProps) { return <IconFrame {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></IconFrame>; }
/** Lucide Link2 geometry, exposed through the platform icon boundary. */
export function LinkIcon(props: IconProps) { return <IconFrame {...props}><path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8" /></IconFrame>; }
/** Lucide ArrowUpDown geometry for an available, inactive sort. */
export function ArrowUpDownIcon(props: IconProps) { return <IconFrame {...props}><path d="m21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16" /></IconFrame>; }
/** Lucide ArrowUp geometry for an active ascending sort. */
export function ArrowUpIcon(props: IconProps) { return <IconFrame {...props}><path d="m5 12 7-7 7 7M12 19V5" /></IconFrame>; }
/** Lucide ArrowDown geometry for an active descending sort. */
export function ArrowDownIcon(props: IconProps) { return <IconFrame {...props}><path d="M12 5v14M19 12l-7 7-7-7" /></IconFrame>; }
/** Lucide EllipsisVertical geometry for contextual row actions. */
export function MoreVerticalIcon(props: IconProps) { return <IconFrame {...props}><circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></IconFrame>; }
/** Lucide Star geometry. Consumers opt into fill through currentColor. */
export function StarIcon(props: IconProps) { return <IconFrame {...props}><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" /></IconFrame>; }
/** Lucide Eye geometry for entity-neutral view actions. */
export function EyeIcon(props: IconProps) { return <IconFrame {...props}><path d="M2.06 12.35a1 1 0 0 1 0-.7C3.73 7.6 7.68 5 12 5c4.32 0 8.27 2.6 9.94 6.65a1 1 0 0 1 0 .7C20.27 16.4 16.32 19 12 19c-4.32 0-8.27-2.6-9.94-6.65Z" /><circle cx="12" cy="12" r="3" /></IconFrame>; }
/** Lucide Copy geometry for entity-neutral copy actions. */
export function CopyIcon(props: IconProps) { return <IconFrame {...props}><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></IconFrame>; }
