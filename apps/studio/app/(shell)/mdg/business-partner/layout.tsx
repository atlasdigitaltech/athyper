const links=[
  ["/mdg/business-partner","Overview"],
  ["/mdg/business-partner/model","Data Model"],
  ["/mdg/business-partner/validation","Validation"],
  ["/mdg/business-partner/matching","Matching"],
  ["/mdg/business-partner/workflows","Workflows"],
  ["/mdg/business-partner/publication","Publication"],
] as const;
export default function BusinessPartnerStudioLayout({children}:{readonly children:React.ReactNode}){return <><nav className="athyper-module-nav" aria-label="Business Partner configuration">{links.map(([href,label])=><a key={href} href={href}>{label}</a>)}</nav>{children}</>;}
