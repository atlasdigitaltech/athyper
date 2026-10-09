---
title: Cloud and region placement analysis — KSA, Singapore, Malaysia, India
---

# Cloud and region placement analysis — KSA, Singapore, Malaysia, India

Analysis to support a future production hosting decision. **No provider or region
is selected here**, no resource is provisioned, and this document does not
authorise provisioning. The architecture overview still records production hosting
and region as open. The container surface being placed is described in
[container decomposition across DEV, QA, STG and Production](/operations/container-decomposition-dev-qa-stg-prod).

Region facts were checked against provider primary documentation where available.
Claims that are announcement-only, vendor-reported or unverified are marked,
because in this market the gap between a press release and a purchasable region
endpoint is the most common planning error.

## 1. What the stack requires of a region

These are properties of the repository, not preferences. They narrow the choice
before any commercial comparison.

| Requirement                                                                                                                      | Evidence                                                                                                             | Consequence                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| S3-compatible object storage with three buckets, versioning, at-rest encryption, TLS-only policy and a no-delete writer identity | `deploy/aws/object-storage/README.md`, `deploy/compose/instance/compose.aws-storage.yaml`                            | The provider needs a real S3 API, not a blob API behind a gateway                                              |
| Two distinct workload identities resolved as SDK credential profiles                                                             | `APP_S3_PROFILE`, `ARTIFACTS_WRITER_S3_PROFILE`                                                                      | Non-AWS hosts are already supported through IAM Roles Anywhere; another cloud's native identity needs bridging |
| **Regional Amazon S3 endpoints only** in STG/PROD                                                                                | `server/apps/platform-host/src/config/environment.ts` rejects `S3_ENDPOINT` and `S3_PUBLIC_ENDPOINT` outside `local` | Object storage must be AWS today, regardless of where the containers run                                       |
| Managed or self-hosted PostgreSQL for three plane databases plus IAM                                                             | `db`, `iam` services                                                                                                 | In-region managed PostgreSQL is the cheapest operational win                                                   |
| Redis-compatible cache, queue and secret cache, three isolated instances                                                         | `memorycache`, `jobqueue`, `secretstore-cache`                                                                       | Managed Redis/Valkey must support instance or logical isolation                                                |
| A multi-host topology with at least two nodes and a recorded approver                                                            | `deploy/instances/schemas/topology-requirement.schema.json`                                                          | A single-availability-domain region cannot satisfy genuine in-region HA; DR must be cross-region               |
| A load balancer plus certificate management in front of Traefik                                                                  | `deploy/compose/platform/compose.yaml` ingress; TLS material as secrets                                              | Every candidate needs managed ingress or a clean load-balancer path                                            |
| Transactional email via Amazon SES v2, plus web push                                                                             | `EMAIL_PROVIDER=ses`, VAPID keys                                                                                     | SES is regional; a non-AWS placement needs a mail transport decision                                           |

The decisive constraint is the third row: today the runtime accepts only AWS S3 for
STG/PROD. Everything else is portable by configuration.

## 2. Saudi Arabia

### 2.1 What exists in the Kingdom

| Provider                        | Region                                               | Status                               | Zones / ADs     | Notes                                                                                                                                                                                                                      |
| ------------------------------- | ---------------------------------------------------- | ------------------------------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Oracle OCI                      | `me-riyadh-1` Saudi Arabia Central (Riyadh), key RUH | **Live**                             | **1 AD**        | Direct sale; three fault domains inside the AD                                                                                                                                                                             |
| Oracle OCI                      | `me-jeddah-1` Saudi Arabia West (Jeddah), key JED    | **Live**                             | **1 AD**        | Roughly 850 km from Riyadh                                                                                                                                                                                                 |
| Google Cloud                    | `me-central2` Dammam                                 | **Live**                             | 3 zones         | For KSA-billing customers, sold only through CNTXT; the rest need invoiced billing                                                                                                                                         |
| AWS                             | Saudi Arabia                                         | **Announced only**                   | —               | The [AWS regions table](https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html) lists 34 regions with **no Saudi entry**; nearest are `me-south-1` Bahrain (3 AZ) and `me-central-1` UAE (3 AZ) |
| Microsoft Azure                 | Saudi Arabia East                                    | **Announced only**                   | 3 planned       | The [Azure regions list](https://learn.microsoft.com/en-us/azure/reliability/regions-list) has no Saudi row                                                                                                                |
| Alibaba (SCCC), Huawei, Tencent | Riyadh (Huawei also Jeddah)                          | Live per vendor and market reporting | 2–3             | Chinese vendors; see the procurement caveat in section 2.4                                                                                                                                                                 |
| stc Oracle Alloy                | In-Kingdom, center3 facilities                       | Live offering                        | Oracle-operated | More than 100 OCI services under Saudi operational control ([Oracle announcement](https://www.oracle.com/sa/news/announcement/blog/stc-offer-sovereign-cloud-services-in-saudi-arabia-with-oracle-alloy-2024-04-23/))      |

Oracle's own [regions and availability domains](https://docs.oracle.com/en-us/iaas/Content/General/Concepts/regions.htm)
page confirms a single availability domain for Riyadh, Jeddah, Singapore, Kulai,
Mumbai and Hyderabad. Regions launched in new geographies deliberately start with
one AD and three fault domains.

### 2.2 The practical KSA options

**Option A — Oracle OCI Riyadh, with Jeddah as the DR region.**
Two live in-Kingdom regions, direct contracting, no reseller in the middle, and an
S3 compatibility API for object storage. The cost is that neither region has a
second availability domain, so in-region HA is limited to fault domains and the
real DR story is Riyadh to Jeddah. That suits a stack whose own topology schema
already demands multi-host placement and which treats DR as a separate concern.

**Option B — Google Cloud Dammam.**
The only in-Kingdom Western region with three zones, so the only one where a
single-region multi-zone HA design is possible. Two costs: contracting and support
run through CNTXT rather than Google directly, and Dammam's machine-type catalogue
is materially narrower than a flagship region. Verify per service.

**Option C — Wait for AWS or Azure Saudi Arabia.**
Both are announced with near-term targets. Planning against an announced region is
the known failure mode here: this is the claim most often misreported as already
available. Treat "AWS Riyadh" as non-existent until a Saudi row appears in AWS's
own regions table.

**Option D — Run in UAE or Bahrain.**
Only if residency permits. A KSA-resident workload loses the residency argument
entirely, and Gulf public-internet paths are frequently slower than the distance
suggests, so any such decision needs latency measured from the actual consumer
locations rather than estimated from a map.

### 2.3 Object storage for a KSA placement

This is where the KSA question meets the repository constraint. Three paths, in
order of change required:

1. **AWS S3 in `me-central-1` (UAE) or `me-south-1` (Bahrain)** with the existing
   AWS-only validation, Roles Anywhere profiles and the existing CloudFormation
   template. **Zero framework change.** Costs data residency for object bytes and
   adds cross-border egress and latency for every attachment, derivative and report
   pack.
2. **OCI Object Storage through the OCI S3 Compatibility API**, or **GCS through
   the XML API interoperability mode**, or Alibaba OSS, Huawei OBS, Tencent COS.
   In-Kingdom residency, but requires relaxing the fail-closed `S3_ENDPOINT` check
   in shared platform configuration. That is shared-framework work with a security
   contract behind it (distinct endpoints, distinct profiles, TLS-only, no static
   keys) and needs its own approval, not a drive-by edit.
3. **Self-managed S3 on Kubernetes**, for example the SeaweedFS image already
   hardened and tested here for DEV/QA. In-Kingdom and provider-neutral, but it
   reintroduces exactly the operational burden that the DEV/QA design deliberately
   scopes to disposable environments. Not recommended for production records.

### 2.4 Compliance caveats

Residency in the Kingdom bites through data classification and the customer's
sector rather than a single blanket statute: PDPL permits transfer subject to
conditions, NCA Cloud Cybersecurity Controls CCC-2:2024 govern the control set, and
government data is where the hard obligations sit. Separately, three of the live
in-Kingdom regions belong to Chinese vendors. Two are on the US Department of
Defense 1260H list of Chinese military companies, and Huawei sits on the US
Commerce Entity List. That is a procurement and defence-contracting exposure rather
than a technical defect, but it is not reversible cheaply, and it should be
evaluated before any such region is selected.

## 3. Singapore, Malaysia and India

Singapore is the strongest hub in the region; Malaysia is now a genuine
multi-cloud market whose newest regions are service-thin; India is effectively a
Western-cloud-only market.

### 3.1 In-country region availability

| Provider      | Singapore                                          | Malaysia                                                  | India                                                                                                    |
| ------------- | -------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| AWS           | `ap-southeast-1`, 3 AZ, default-enabled            | `ap-southeast-5`, 3 AZ, **opt-in required**               | `ap-south-1` Mumbai 3 AZ; `ap-south-2` Hyderabad 3 AZ, opt-in required                                   |
| Azure         | `southeastasia`, 3 AZ                              | `malaysiawest` Kuala Lumpur, 3 AZ                         | `centralindia` Pune 3 AZ; `indiasouthcentral` Hyderabad 3 AZ; `southindia` and `westindia` have **0 AZ** |
| Google Cloud  | `asia-southeast1`                                  | `asia-southeast4` Kuala Lumpur, live but **service-thin** | `asia-south1` Mumbai; `asia-south2` Delhi NCR                                                            |
| Oracle OCI    | `ap-singapore-1`, `ap-singapore-2` — **1 AD each** | `ap-kulai-2` Kulai — **1 AD**                             | `ap-mumbai-1`, `ap-hyderabad-1` — **1 AD each**                                                          |
| Alibaba Cloud | Singapore, 4 AZ                                    | Kuala Lumpur 3 AZ; Johor 3 AZ                             | **Not present**                                                                                          |
| Huawei Cloud  | `ap-southeast-3`                                   | **Not present**                                           | **Not present**                                                                                          |
| Tencent Cloud | Singapore, 4 AZ                                    | Johor Bahru 2 AZ                                          | **Not present**                                                                                          |

Two structural observations:

- **Singapore is the only market where every provider family is present**, and it
  is the connectivity hub for the region.
- **All three Chinese hyperscalers are absent from India**, and Azure's
  Jio-operated India regions no longer appear in Azure's current regions list.
  India is a four-provider market: AWS, Azure, Google and OCI.

### 3.2 Object storage API availability — the deciding technical filter

| Provider                 | Object storage | S3 API                                        |
| ------------------------ | -------------- | --------------------------------------------- |
| AWS                      | S3             | Native                                        |
| Oracle OCI               | Object Storage | S3 Compatibility API                          |
| Google Cloud             | Cloud Storage  | S3-compatible XML API (interoperability mode) |
| Alibaba, Huawei, Tencent | OSS, OBS, COS  | Native S3-compatible                          |
| **Azure**                | Blob Storage   | **Not S3-compatible**; requires a gateway     |

Azure is therefore disqualified for object storage by the current stack unless a
gateway is introduced, which would be a new component to operate and secure. It
stays viable for compute with object storage elsewhere, but that splits the
placement.

### 3.3 Sovereignty and residency

| Market       | Framework                                                                                                                                          | What it actually requires                                                                                                                                                                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Singapore    | PDPA; MAS outsourcing and technology-risk rules for financial institutions                                                                         | No general localisation. MAS obligations are notification, risk management and exit or concentration planning, not in-country storage. A foreign cloud's Singapore region generally satisfies them.                                                                                      |
| Malaysia     | PDPA 2010 as amended in 2024; MCMC cloud service provider class licence                                                                            | PDPA dropped the cross-border whitelist, so no general localisation. The CSP licence attaches to the **operator**, not the region, which a Malaysia-resident region simplifies.                                                                                                          |
| India        | DPDP Act 2023 and DPDP Rules 2025 (phased, with milestones extending into 2027); RBI payment-data localisation; MeghRaj empanelment for government | **RBI is the hard rule**: payment system data must be stored only in India. If any payment-shaped data is in scope it cannot leave an India region. Government work is gated on MeghRaj empanelment. DPDP adds Significant Data Fiduciary duties without a blanket localisation mandate. |
| Saudi Arabia | PDPL with transfer conditions; NCA CCC-2:2024; SDAIA and NDMO classification for government data                                                   | See section 2.4.                                                                                                                                                                                                                                                                         |

Residency is a property of the data and the customer, not of the container host.
That distinction decides whether one deployment can serve all four markets or
whether the platform needs per-market instances.

### 3.4 Recommended shape for these three markets

If Malaysia and India tenants are served from a shared regional deployment rather
than in-country regions, **Singapore is the correct hub**: the densest
connectivity, every provider present, and no localisation rule that forbids it.
Malaysia and India regions become necessary only when a specific tenant's
regulatory position requires in-country processing: RBI payment data, Malaysian
government work, or MeghRaj government work.

## 4. Comparison of the realistic combinations

| Combination                                                                                            | Object storage path                                                           | Framework change                          | Strengths                                                                                     | Weaknesses                                                                                           |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **AWS containers anywhere plus AWS S3** (Singapore, Malaysia, India, `me-central-1`)                   | Native S3, existing CloudFormation template, Roles Anywhere for non-AWS hosts | **None**                                  | Only fully validated path in the repository; 3 AZ everywhere; strongest service breadth       | KSA object bytes leave the Kingdom; EKS-grade lock-in if containers also move to AWS                 |
| **OCI containers plus OCI S3 Compatibility API** (Riyadh, Jeddah, Singapore, Kulai, Mumbai, Hyderabad) | OCI Object Storage                                                            | Endpoint override in shared configuration | Live in-Kingdom Western option; direct contracting; covers KSA, Singapore, Malaysia and India | 1 AD per region everywhere; each region needs its own DR design                                      |
| **Google Cloud containers plus GCS interoperability** (Dammam, Singapore, Kuala Lumpur, Mumbai, Delhi) | GCS XML API                                                                   | Endpoint override in shared configuration | Only 3-zone in-Kingdom option; broad catalogue                                                | KSA sold only through CNTXT; Dammam catalogue gaps; Kuala Lumpur is service-thin and has no BigQuery |
| **AWS containers and AWS S3, KSA only in UAE or Bahrain**                                              | Native S3                                                                     | None                                      | Simplest, fully validated                                                                     | KSA residency lost                                                                                   |
| **Azure**                                                                                              | Blob only, not S3-compatible                                                  | New gateway component                     | Strong regions in Singapore, Malaysia and India                                               | Disqualified for object storage without a gateway; no live KSA region                                |
| **China hyperscalers**                                                                                 | OSS, OBS, COS                                                                 | Endpoint override                         | Cheap, present in KSA, Singapore and Malaysia                                                 | Absent from India; procurement and compliance exposure for restricted workloads                      |

## 5. Findings and what would need deciding

1. **The object-storage constraint, not the compute location, is the real
   decision.** Because STG/PROD validation insists on regional AWS S3 endpoints, a
   KSA-resident deployment still stores object bytes abroad unless shared
   configuration changes. Every other choice here is downstream of that one.
2. **Do not plan against an announced region.** AWS and Azure have no live Saudi
   region today. Any KSA production date before those launch is an OCI or Google
   Cloud date.
3. **Single-AD regions force a specific HA design.** Riyadh, Jeddah, Kulai,
   Singapore and both India OCI regions have one availability domain each. A
   topology requiring in-region multi-AZ HA cannot be satisfied there, and the
   approved topology requirement would have to accept cross-region DR instead.
4. **Validate per service, not per provider.** The newest regions — Google Kuala
   Lumpur, Azure Malaysia West and India South Central, OCI Kulai — have
   unverified or missing service coverage, and Kuala Lumpur has no BigQuery.
   Nothing should be committed on a provider-level "we are in that region" claim.
5. **Latency must be measured, not assumed.** Gulf public-internet paths between
   Riyadh and its neighbours are frequently far above the physical floor, so the
   UAE or Bahrain fallback needs measurement from actual consumer locations.
6. **India may need its own instance.** RBI payment-data localisation is a hard
   in-India constraint and MeghRaj gates government work. If either applies, a
   shared Singapore deployment is not sufficient.
7. **A non-AWS object store is shared-framework work.** Supporting OCI Object
   Storage or GCS interoperability means changing the fail-closed endpoint
   validation in `server/apps/platform-host/src/config/environment.ts` and the
   storage overlay, with an equivalent strictness guarantee. That is a framework
   change requiring owner approval, a provider contract test, and the same
   three-bucket, two-identity, no-delete-writer guarantees that exist for AWS.
8. **Nothing here authorises provisioning.** Provider selection, residency
   decisions, data classification and the object-storage change each need explicit
   owner approval and their own qualification evidence.

## 6. Sources

Primary region documentation:

- AWS regions and availability zones: <https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html>
- Azure regions list: <https://learn.microsoft.com/en-us/azure/reliability/regions-list>
- Oracle Cloud regions and availability domains: <https://docs.oracle.com/en-us/iaas/Content/General/Concepts/regions.htm>
- OCI Malaysia West 2 (Kulai) release note: <https://docs.oracle.com/en-us/iaas/releasenotes/oci/new-region-malaya-2.htm>
- Google Cloud Dammam region access and CNTXT channel: <https://docs.cloud.google.com/docs/dammam-region-access>
- Google Cloud BigQuery locations: <https://docs.cloud.google.com/bigquery/docs/locations>
- Alibaba Cloud global locations: <https://www.alibabacloud.com/en/global-locations>
- Huawei Cloud data centre regions: <https://www.huaweicloud.com/intl/en-us/securecenter/data_protection/region_query.html>
- Tencent Cloud global infrastructure: <https://www.tencentcloud.com/global-infrastructure>

Launch and offering announcements:

- stc sovereign cloud with Oracle Alloy: <https://www.oracle.com/sa/news/announcement/blog/stc-offer-sovereign-cloud-services-in-saudi-arabia-with-oracle-alloy-2024-04-23/>
- AWS Malaysia region launch: <https://aws.amazon.com/blogs/aws/now-open-aws-asia-pacific-malaysia-region/>
- Azure Malaysia West launch: <https://www.nst.com.my/amp/business/corporate/2025/05/1222724/microsoft-debuts-malaysia-west-cloud-region-under-us22bil>

Regulatory and control frameworks:

- MAS outsourcing guidelines: <https://www.mas.gov.sg/regulation/guidelines/guidelines-on-outsourcing-financial-institutions-other-than-banks>
- MCMC licensing guidebook, cloud service provider class licence: <https://www.mcmc.gov.my/skmmgovmy/media/General/pdf/2025/MCMC-Licensing-Guidebook-2025.pdf>
- RBI storage of payment system data FAQ: <https://website.rbi.org.in/web/rbi/faq-page-2>
- MeitY Cloud Services Bouquet, MeghRaj empanelment: <https://www.meity.gov.in/writereaddata/files/8.%20Cloud_Services_Bouquet.pdf>
- NCA Cloud Cybersecurity Controls CCC-2:2024: <https://nca.gov.sa/en/regulatory-documents/controls-list/ccc/>
