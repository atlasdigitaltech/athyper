# Staging and production object storage — pending provisioning

No AWS resources have been provisioned and no data has been migrated to AWS.
DEV and QA use independent local SeaweedFS instances. This CloudFormation stack
is only for STG/PROD; their missing configuration must not select local storage.

Deploy `template.yaml` separately in the chosen staging account/region and an
isolated production account/region. Supply three distinct, globally available
bucket names. No account IDs, region, bucket names or role ARNs in this directory
represent deployed resources. The region is the CloudFormation deployment region.

The template creates three private buckets with versioning, SSE-KMS encryption,
all four public-access blocks, bucket-owner-enforced ownership and TLS-only
policies. The customer-managed KMS key rotates annually. Buckets and the key are
retained on stack deletion/replacement. The application role can manage documents
and transfers and read artifacts. The separate writer role can upload/read
artifacts but cannot delete objects or object versions. These runtime roles do
not administer bucket policies or credentials. KMS permissions apply only through
S3 in the selected region.

## Contabo staging authentication

Use IAM Roles Anywhere (`AuthenticationMode=roles-anywhere`, the default).
Create a dedicated certificate authority and separate short-lived X.509 client
certificates for the application and artifacts writer. Keep the CA private key
off the application host. Supply only its **public certificate bundle** to
`CertificateAuthorityPem`, and the distinct certificate subject common names to
`AppCertificateCommonName` and `WriterCertificateCommonName`.

Install the official AWS signing helper on Contabo, verify its published SHA256,
and mount the helper, AWS config and each workload's certificate/private key
read-only in the application runtime. Restrict private keys to the workload user.
Configure certificate renewal and revocation before release. Each profile obtains
renewable one-hour credentials; do not copy a temporary credential result into
an environment file.

After provisioning, build a shared AWS config using actual stack outputs:

```ini
[profile athyper-app]
credential_process = /run/aws/aws_signing_helper credential-process --certificate /run/aws/app-certificate.pem --private-key /run/aws/app-private-key.pem --trust-anchor-arn <TrustAnchorArn output> --profile-arn <AppProfileArn output> --role-arn <AppRoleArn output>

[profile athyper-artifacts-writer]
credential_process = /run/aws/aws_signing_helper credential-process --certificate /run/aws/writer-certificate.pem --private-key /run/aws/writer-private-key.pem --trust-anchor-arn <TrustAnchorArn output> --profile-arn <WriterProfileArn output> --role-arn <WriterRoleArn output>
```

Set `ATHYPER_AWS_AUTH_ROOT` to the owner-protected host directory containing
`config`, the helper executable and certificates/private keys. Include
`deploy/compose/instance/compose.aws-storage.yaml` after the base and parity files
(the STG planner includes it automatically). It disables local storage services
and mounts the bundle read-only at `/run/aws`. Missing settings abort rendering.
Set `AWS_CONFIG_FILE` to that mounted config. The S3 adapter uses separate profile
providers and renews credentials through the SDK. Set `APP_S3_PROFILE` and
`ARTIFACTS_WRITER_S3_PROFILE` to the corresponding names. Do not set static S3 keys.

If production runs on AWS, `AuthenticationMode=aws-principal` accepts separate
existing `TrustedAppRoleArn` and `TrustedWriterRoleArn`. Configure corresponding
SDK profiles with `role_arn` from stack outputs and a credential source appropriate
to the actual hosting platform. Do not invent workload role ARNs. If production
runs outside AWS, use Roles Anywhere as for Contabo.

## Remaining setup and release steps

1. Select accounts/regions, bucket names, workload identities and certificate CA.
2. Run `cfn-lint template.yaml`, then prepare a CloudFormation change set with those
   parameters and `CAPABILITY_IAM`. Review costs, resource names and policies.
3. Explicitly execute the approved change set. This repository task does not
   authorize provisioning or AWS data migration.
4. Record the actual outputs in the deployment secret/configuration system. Set
   `S3_REGION`, `S3_BUCKET_DOCUMENTS`, `S3_BUCKET_ARTIFACTS`, `S3_BUCKET_TRANSFERS`,
   the two SDK profiles, and `AWS_CONFIG_FILE`. Leave `S3_ENDPOINT` and
   `S3_PUBLIC_ENDPOINT` unset; the SDK uses regional AWS endpoints.
5. Seed `_probes/artifacts-sentinel` in the artifacts bucket with body `ok` under
   the writer role. Verify all three bucket probes, presigned GET/PUT, multipart,
   encryption, versioning, public denials and writer delete denials. Verify
   credential renewal beyond one session and certificate revocation behavior.
6. Establish backup/retention, lifecycle and monitoring requirements before use.
   Versioning is not a substitute for an independent recovery plan. Lifecycle
   expiration is deliberately not enabled without a retention decision.
7. Plan and separately authorize AWS migration and cutover. STG/PROD storage stays
   **pending provisioning** until those setup and qualification steps pass.

References: [AWS Roles Anywhere credential helper](https://docs.aws.amazon.com/rolesanywhere/latest/userguide/credential-helper.html),
[AWS S3 CloudFormation resource](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-s3-bucket.html).
