import * as React from "react";
import { IconFrame, type IconProps } from "./icon";

export function DatabaseIcon(props: IconProps) { return <IconFrame {...props}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></IconFrame>; }
export function DatabaseCheckIcon(props: IconProps) { return <IconFrame {...props}><ellipse cx="10" cy="5" rx="7" ry="3"/><path d="M3 5v6c0 1.5 3 2.7 7 2.7M3 11v5c0 1.5 3 3 7 3"/><path d="m14 17 2 2 4-5"/></IconFrame>; }
export function LandmarkIcon(props: IconProps) { return <IconFrame {...props}><path d="m3 10 9-6 9 6M5 10h14M6 10v7M10 10v7M14 10v7M18 10v7M3 20h18"/></IconFrame>; }
export function RouteIcon(props: IconProps) { return <IconFrame {...props}><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h3a3 3 0 0 0 3-3V8a3 3 0 0 1 3-3"/></IconFrame>; }
export function HandshakeIcon(props: IconProps) { return <IconFrame {...props}><path d="m8 11 3 3a2 2 0 0 0 3 0l5-5M2 9l4-4 4 3M22 9l-4-4-4 3M6 13l4 4a2 2 0 0 0 3 0l1-1"/></IconFrame>; }
export function UsersIcon(props: IconProps) { return <IconFrame {...props}><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 4a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5"/></IconFrame>; }
export function BriefcaseIcon(props: IconProps) { return <IconFrame {...props}><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2"/></IconFrame>; }
export function FactoryIcon(props: IconProps) { return <IconFrame {...props}><path d="M3 21V9l6 3V8l6 3V4h4v17M3 21h18M7 17h2M12 17h2M17 17h2"/></IconFrame>; }
export function PackageIcon(props: IconProps) { return <IconFrame {...props}><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 8 9 5 9-5v9l-9 5-9-5V8ZM12 13v9"/></IconFrame>; }
export function OrganizationIcon(props: IconProps) { return <IconFrame {...props}><rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="17" width="6" height="4" rx="1"/><rect x="15" y="17" width="6" height="4" rx="1"/><path d="M12 8v5M6 17v-2h12v2"/></IconFrame>; }
export function MapPinIcon(props: IconProps) { return <IconFrame {...props}><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></IconFrame>; }
export function BookOpenIcon(props: IconProps) { return <IconFrame {...props}><path d="M3 5a7 7 0 0 1 9 2v14a7 7 0 0 0-9-2V5ZM21 5a7 7 0 0 0-9 2v14a7 7 0 0 1 9-2V5Z"/></IconFrame>; }
export function ReceiptOutIcon(props: IconProps) { return <IconFrame {...props}><path d="M5 3h11a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2V4"/><path d="M9 8h5M9 12h3M14 14l4 4m0-4v4h-4"/></IconFrame>; }
export function ReceiptInIcon(props: IconProps) { return <IconFrame {...props}><path d="M5 3h11a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2V4"/><path d="M9 8h5M9 12h3M18 18l-4-4m0 4v-4h4"/></IconFrame>; }
export function CoinsIcon(props: IconProps) { return <IconFrame {...props}><ellipse cx="9" cy="6" rx="6" ry="3"/><path d="M3 6v5c0 1.7 2.7 3 6 3M3 11v5c0 1.7 2.7 3 6 3"/><ellipse cx="16" cy="15" rx="5" ry="3"/><path d="M11 15v4c0 1.7 2.2 3 5 3s5-1.3 5-3v-4"/></IconFrame>; }
export function WalletIcon(props: IconProps) { return <IconFrame {...props}><path d="M4 5h14a2 2 0 0 1 2 2v13H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path d="M16 11h6v5h-6a2.5 2.5 0 0 1 0-5Z"/></IconFrame>; }
export function PercentReceiptIcon(props: IconProps) { return <IconFrame {...props}><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z"/><path d="m9 15 6-6M9 9h.01M15 15h.01"/></IconFrame>; }
export function TargetIcon(props: IconProps) { return <IconFrame {...props}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/><path d="m15 9 6-6M17 3h4v4"/></IconFrame>; }
export function FileSignatureIcon(props: IconProps) { return <IconFrame {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 17c2-3 3 1 5-2 1-1 2 1 3 0"/></IconFrame>; }
export function ChartIcon(props: IconProps) { return <IconFrame {...props}><path d="M3 3v18h18"/><path d="m6 16 4-5 4 3 5-7"/></IconFrame>; }
export function BoxesIcon(props: IconProps) { return <IconFrame {...props}><path d="m7 3 4 2-4 2-4-2 4-2ZM3 5v4l4 2 4-2V5M17 3l4 2-4 2-4-2 4-2ZM13 5v4l4 2 4-2V5M12 13l5 2.5-5 2.5-5-2.5 5-2.5ZM7 15.5V20l5 2 5-2v-4.5"/></IconFrame>; }
export function TruckIcon(props: IconProps) { return <IconFrame {...props}><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></IconFrame>; }
export function TagIcon(props: IconProps) { return <IconFrame {...props}><path d="M20 13 11 22 2 13V4h9l9 9Z"/><circle cx="7" cy="9" r="1.5"/></IconFrame>; }
export function IdCardIcon(props: IconProps) { return <IconFrame {...props}><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M5 16a3 3 0 0 1 6 0M14 10h5M14 14h4"/></IconFrame>; }
export function UserClockIcon(props: IconProps) { return <IconFrame {...props}><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 10-4.5"/><circle cx="17" cy="17" r="4"/><path d="M17 15v2l1.5 1"/></IconFrame>; }
export function UserStarIcon(props: IconProps) { return <IconFrame {...props}><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 10-4.5"/><path d="m18 12 1.1 2.2 2.4.4-1.8 1.7.4 2.5-2.1-1.2-2.1 1.2.4-2.5-1.8-1.7 2.4-.4L18 12Z"/></IconFrame>; }
export function BanknoteIcon(props: IconProps) { return <IconFrame {...props}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9H5v1M18 15h1v-1"/></IconFrame>; }
export function GanttIcon(props: IconProps) { return <IconFrame {...props}><path d="M4 5v14M4 7h6M4 12h12M4 17h8"/><circle cx="12" cy="7" r="1"/><circle cx="18" cy="12" r="1"/><circle cx="14" cy="17" r="1"/></IconFrame>; }
export function HeadsetIcon(props: IconProps) { return <IconFrame {...props}><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14h3v6H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 1-2ZM20 14h-3v6h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-1-2ZM17 20c0 1-2 2-4 2"/></IconFrame>; }
export function WrenchIcon(props: IconProps) { return <IconFrame {...props}><path d="M14 6a5 5 0 0 0-7 6L2 17l5 5 5-5a5 5 0 0 0 6-7l-3 3-4-4 3-3Z"/></IconFrame>; }
export function BuildingKeyIcon(props: IconProps) { return <IconFrame {...props}><path d="M4 21V5h10v16M4 9H2v12M8 9h2M8 13h2M8 17h2M2 21h20"/><circle cx="18" cy="9" r="2"/><path d="M18 11v5h3"/></IconFrame>; }
export function AssetIcon(props: IconProps) { return <IconFrame {...props}><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 6V3h8v3M8 18v3h8v-3M7 10h10M7 14h6"/></IconFrame>; }
