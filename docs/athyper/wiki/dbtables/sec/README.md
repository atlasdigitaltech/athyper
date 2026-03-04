# sec Schema -- Security & Multi-Factor Authentication

**Source DDL**: `framework/adapters/db/src/sql/050_sec.sql`
**PostgreSQL**: 16+

The `sec` schema implements the platform's security infrastructure for multi-factor authentication (MFA), device trust management, security event auditing, and password policy enforcement. All tables are tenant-scoped and reference `core.tenant` and `core.principal` from the core identity model. The schema supports four MFA methods (TOTP, email OTP, SMS OTP, WebAuthn/passkeys) through a normalized configuration hierarchy, and provides an append-only security event log for compliance and forensic analysis.

---

## Table of Contents

1. [sec.mfa_challenge](#secmfa_challenge)
2. [sec.mfa_config](#secmfa_config)
3. [sec.totp_instance](#sectotp_instance)
4. [sec.email_otp_instance](#secemail_otp_instance)
5. [sec.sms_otp_instance](#secsms_otp_instance)
6. [sec.webauthn_credential](#secwebauthn_credential)
7. [sec.security_event](#secsecurity_event)
8. [sec.trusted_device](#sectrusted_device)
9. [sec.password_history](#secpassword_history)
10. [sec.verify_mfa_challenge() (Function)](#secverify_mfa_challenge-function)

---

## sec.mfa_challenge

### Functional Description

Represents an in-flight MFA authentication challenge. When a user initiates a login or step-up authentication that requires a second factor, a challenge row is created with the expected secret, an expiration window (default 10 minutes), and an attempt counter. The challenge is single-use: once verified or expired, it cannot be reused. The `max_attempts` column enforces brute-force protection at the database level.

### Technical Details

| Column         | Type        | Nullable | Default                         | Description                                                        |
| -------------- | ----------- | -------- | ------------------------------- | ------------------------------------------------------------------ |
| id             | uuid        | NOT NULL | `gen_random_uuid()`             | Surrogate primary key.                                             |
| tenant_id      | uuid        | NOT NULL | --                              | Owning tenant. FK to `core.tenant`.                                |
| principal_id   | uuid        | NOT NULL | --                              | The principal being challenged. FK to `core.principal`.            |
| challenge_type | text        | NOT NULL | --                              | MFA method type for this challenge.                                |
| challenge_data | jsonb       | NOT NULL | --                              | Method-specific challenge payload (e.g. masked phone, email hint). |
| secret         | text        | NOT NULL | --                              | Expected verification code or secret.                              |
| attempts       | int         | NOT NULL | `0`                             | Number of verification attempts made so far.                       |
| max_attempts   | int         | NOT NULL | `3`                             | Maximum allowed verification attempts.                             |
| status         | text        | NOT NULL | `'pending'`                     | Challenge lifecycle status.                                        |
| verified_at    | timestamptz | YES      | --                              | Timestamp when the challenge was successfully verified.            |
| expires_at     | timestamptz | NOT NULL | `now() + interval '10 minutes'` | Expiration timestamp. Challenges expire automatically.             |
| created_at     | timestamptz | NOT NULL | `now()`                         | Row creation timestamp.                                            |
| created_by     | text        | NOT NULL | --                              | Identity that created the challenge.                               |

### Primary Key

`id` (uuid)

### Check Constraints

- `mfa_challenge_type_chk`: `challenge_type IN ('totp', 'email', 'sms', 'webauthn', 'backup')`
- `mfa_challenge_status_chk`: `status IN ('pending', 'verified', 'expired', 'failed')`

### Foreign Keys

| FK Column    | References         | On Delete |
| ------------ | ------------------ | --------- |
| tenant_id    | core.tenant(id)    | CASCADE   |
| principal_id | core.principal(id) | CASCADE   |

### Indexes

| Index Name                  | Columns                             | Notes                                                    |
| --------------------------- | ----------------------------------- | -------------------------------------------------------- |
| idx_mfa_challenge_principal | (tenant_id, principal_id, status)   | Find active challenges for a principal.                  |
| idx_mfa_challenge_expires   | expires_at WHERE status = 'pending' | Partial index for cleanup of expired pending challenges. |

### Relationships

- **Parents**: `core.tenant` via `tenant_id`, `core.principal` via `principal_id`
- **Used by**: `sec.verify_mfa_challenge()` function

---

## sec.mfa_config

### Functional Description

Stores the MFA authenticator configuration for each principal. A principal may have multiple MFA methods registered (TOTP, email, SMS, WebAuthn), but only one configuration per method type is allowed (enforced by the deferrable unique constraint). Each configuration tracks whether the method is enabled, verified (enrollment complete), and designated as the primary factor. Backup codes for account recovery are stored as an encrypted text array. Device metadata is captured for device-bound authenticators.

### Technical Details

| Column       | Type        | Nullable | Default             | Description                                                   |
| ------------ | ----------- | -------- | ------------------- | ------------------------------------------------------------- |
| id           | uuid        | NOT NULL | `gen_random_uuid()` | Surrogate primary key.                                        |
| tenant_id    | uuid        | NOT NULL | --                  | Owning tenant. FK to `core.tenant`.                           |
| principal_id | uuid        | NOT NULL | --                  | The principal this config belongs to. FK to `core.principal`. |
| method_type  | text        | NOT NULL | --                  | MFA method: `totp`, `email`, `sms`, `webauthn`.               |
| is_enabled   | boolean     | NOT NULL | `false`             | Whether this method is currently enabled.                     |
| is_verified  | boolean     | NOT NULL | `false`             | Whether enrollment has been verified (setup complete).        |
| is_primary   | boolean     | NOT NULL | `false`             | Whether this is the principal's primary MFA method.           |
| secret       | text        | YES      | --                  | Shared secret (method-dependent; may be NULL for WebAuthn).   |
| backup_codes | text[]      | YES      | --                  | One-time backup/recovery codes (encrypted).                   |
| device_name  | text        | YES      | --                  | User-assigned device name (e.g. `My iPhone`).                 |
| device_id    | text        | YES      | --                  | Device identifier for device-bound authenticators.            |
| device_info  | jsonb       | YES      | --                  | Extended device metadata (OS, browser, etc.).                 |
| last_used_at | timestamptz | YES      | --                  | When this method was last used for authentication.            |
| verified_at  | timestamptz | YES      | --                  | When enrollment verification completed.                       |
| metadata     | jsonb       | YES      | --                  | Extensible metadata.                                          |
| created_at   | timestamptz | NOT NULL | `now()`             | Row creation timestamp.                                       |
| created_by   | text        | NOT NULL | --                  | Identity that created the config.                             |
| updated_at   | timestamptz | YES      | --                  | Last update timestamp.                                        |
| updated_by   | text        | YES      | --                  | Identity that last updated the config.                        |

### Primary Key

`id` (uuid)

### Unique Constraints

- `mfa_config_principal_method_uniq`: `(principal_id, method_type)` -- deferrable

### Check Constraints

- `mfa_config_method_chk`: `method_type IN ('totp', 'email', 'sms', 'webauthn')`

### Foreign Keys

| FK Column    | References         | On Delete |
| ------------ | ------------------ | --------- |
| tenant_id    | core.tenant(id)    | CASCADE   |
| principal_id | core.principal(id) | CASCADE   |

### Indexes

| Index Name               | Columns                                           | Notes                               |
| ------------------------ | ------------------------------------------------- | ----------------------------------- |
| idx_mfa_config_principal | (tenant_id, principal_id)                         | All MFA configs for a principal.    |
| idx_mfa_config_enabled   | (tenant_id, principal_id) WHERE is_enabled = true | Only enabled methods.               |
| idx_mfa_config_primary   | principal_id WHERE is_primary = true              | Quick lookup of the primary method. |

### Relationships

- **Parents**: `core.tenant` via `tenant_id`, `core.principal` via `principal_id`
- **Referenced by**: `sec.totp_instance.mfa_config_id`, `sec.email_otp_instance.mfa_config_id`, `sec.sms_otp_instance.mfa_config_id`, `sec.webauthn_credential.mfa_config_id`

---

## sec.totp_instance

### Functional Description

Stores the TOTP (Time-based One-Time Password) secret and algorithm parameters for an MFA configuration. Each instance contains the shared secret, hash algorithm, digit count, and time period needed to generate and validate TOTP codes per RFC 6238. The `qr_code_url` and `manual_entry_key` facilitate initial enrollment via authenticator apps. The `last_counter` tracks the last accepted time step to prevent replay attacks.

### Technical Details

| Column           | Type        | Nullable | Default             | Description                                                |
| ---------------- | ----------- | -------- | ------------------- | ---------------------------------------------------------- |
| id               | uuid        | NOT NULL | `gen_random_uuid()` | Surrogate primary key.                                     |
| tenant_id        | uuid        | NOT NULL | --                  | Owning tenant. FK to `core.tenant`.                        |
| mfa_config_id    | uuid        | NOT NULL | --                  | Parent MFA configuration. FK to `sec.mfa_config`.          |
| secret           | text        | NOT NULL | --                  | Base32-encoded TOTP shared secret.                         |
| algorithm        | text        | NOT NULL | `'SHA1'`            | Hash algorithm (SHA1, SHA256, SHA512).                     |
| digits           | int         | NOT NULL | `6`                 | Number of digits in the OTP code.                          |
| period           | int         | NOT NULL | `30`                | Time step in seconds.                                      |
| qr_code_url      | text        | YES      | --                  | `otpauth://` URI for QR code enrollment.                   |
| manual_entry_key | text        | YES      | --                  | Human-readable key for manual entry in authenticator apps. |
| last_counter     | int         | YES      | --                  | Last accepted TOTP time-step counter (replay prevention).  |
| last_verified_at | timestamptz | YES      | --                  | When the last successful verification occurred.            |
| created_at       | timestamptz | NOT NULL | `now()`             | Row creation timestamp.                                    |
| created_by       | text        | NOT NULL | --                  | Identity that created the instance.                        |

### Primary Key

`id` (uuid)

### Foreign Keys

| FK Column     | References         | On Delete |
| ------------- | ------------------ | --------- |
| tenant_id     | core.tenant(id)    | CASCADE   |
| mfa_config_id | sec.mfa_config(id) | CASCADE   |

### Indexes

| Index Name                   | Columns       | Notes                                           |
| ---------------------------- | ------------- | ----------------------------------------------- |
| idx_totp_instance_mfa_config | mfa_config_id | Look up TOTP instance by its parent MFA config. |

### Relationships

- **Parents**: `core.tenant` via `tenant_id`, `sec.mfa_config` via `mfa_config_id`

---

## sec.email_otp_instance

### Functional Description

Stores the email address configuration for email-based OTP delivery. Each instance is linked to an MFA configuration and records the target email address along with its verification status. When a user triggers email-based MFA, the system generates a one-time code and sends it to the address stored here. The `verified_at` timestamp confirms that the email address has been validated during enrollment.

### Technical Details

| Column        | Type        | Nullable | Default             | Description                                            |
| ------------- | ----------- | -------- | ------------------- | ------------------------------------------------------ |
| id            | uuid        | NOT NULL | `gen_random_uuid()` | Surrogate primary key.                                 |
| tenant_id     | uuid        | NOT NULL | --                  | Owning tenant. FK to `core.tenant`.                    |
| mfa_config_id | uuid        | NOT NULL | --                  | Parent MFA configuration. FK to `sec.mfa_config`.      |
| email_address | text        | NOT NULL | --                  | Email address for OTP delivery.                        |
| verified_at   | timestamptz | YES      | --                  | When the email address was verified during enrollment. |
| created_at    | timestamptz | NOT NULL | `now()`             | Row creation timestamp.                                |
| created_by    | text        | NOT NULL | --                  | Identity that created the instance.                    |
| updated_at    | timestamptz | YES      | --                  | Last update timestamp.                                 |
| updated_by    | text        | YES      | --                  | Identity that last updated the instance.               |

### Primary Key

`id` (uuid)

### Foreign Keys

| FK Column     | References         | On Delete |
| ------------- | ------------------ | --------- |
| tenant_id     | core.tenant(id)    | CASCADE   |
| mfa_config_id | sec.mfa_config(id) | CASCADE   |

### Indexes

| Index Name                        | Columns                    | Notes                                            |
| --------------------------------- | -------------------------- | ------------------------------------------------ |
| idx_email_otp_instance_mfa_config | mfa_config_id              | Look up email instance by its parent MFA config. |
| idx_email_otp_instance_email      | (tenant_id, email_address) | Find instances by email address within a tenant. |

### Relationships

- **Parents**: `core.tenant` via `tenant_id`, `sec.mfa_config` via `mfa_config_id`

---

## sec.sms_otp_instance

### Functional Description

Stores the phone number configuration for SMS-based OTP delivery. Structurally parallel to `sec.email_otp_instance`, each row records the phone number that receives one-time codes when SMS-based MFA is triggered. The `verified_at` timestamp confirms that the phone number was validated during enrollment, typically by sending a verification code.

### Technical Details

| Column        | Type        | Nullable | Default             | Description                                                   |
| ------------- | ----------- | -------- | ------------------- | ------------------------------------------------------------- |
| id            | uuid        | NOT NULL | `gen_random_uuid()` | Surrogate primary key.                                        |
| tenant_id     | uuid        | NOT NULL | --                  | Owning tenant. FK to `core.tenant`.                           |
| mfa_config_id | uuid        | NOT NULL | --                  | Parent MFA configuration. FK to `sec.mfa_config`.             |
| phone_number  | text        | NOT NULL | --                  | Phone number for SMS OTP delivery (E.164 format recommended). |
| verified_at   | timestamptz | YES      | --                  | When the phone number was verified during enrollment.         |
| created_at    | timestamptz | NOT NULL | `now()`             | Row creation timestamp.                                       |
| created_by    | text        | NOT NULL | --                  | Identity that created the instance.                           |
| updated_at    | timestamptz | YES      | --                  | Last update timestamp.                                        |
| updated_by    | text        | YES      | --                  | Identity that last updated the instance.                      |

### Primary Key

`id` (uuid)

### Foreign Keys

| FK Column     | References         | On Delete |
| ------------- | ------------------ | --------- |
| tenant_id     | core.tenant(id)    | CASCADE   |
| mfa_config_id | sec.mfa_config(id) | CASCADE   |

### Indexes

| Index Name                      | Columns                   | Notes                                           |
| ------------------------------- | ------------------------- | ----------------------------------------------- |
| idx_sms_otp_instance_mfa_config | mfa_config_id             | Look up SMS instance by its parent MFA config.  |
| idx_sms_otp_instance_phone      | (tenant_id, phone_number) | Find instances by phone number within a tenant. |

### Relationships

- **Parents**: `core.tenant` via `tenant_id`, `sec.mfa_config` via `mfa_config_id`

---

## sec.webauthn_credential

### Functional Description

Stores WebAuthn/FIDO2 credentials (passkeys and hardware security keys) registered by principals. Each credential record contains the credential ID (opaque binary handle returned by the authenticator), the public key for signature verification, a sign count for cloning detection, and the AAGUID that identifies the authenticator make and model. Additional FIDO2 metadata -- transport hints, backup eligibility, backup state, and discoverability -- supports the full WebAuthn Level 2 specification for credential management and conditional UI flows.

### Technical Details

| Column                     | Type        | Nullable | Default             | Description                                                         |
| -------------------------- | ----------- | -------- | ------------------- | ------------------------------------------------------------------- |
| id                         | uuid        | NOT NULL | `gen_random_uuid()` | Surrogate primary key.                                              |
| tenant_id                  | uuid        | NOT NULL | --                  | Owning tenant. FK to `core.tenant`.                                 |
| mfa_config_id              | uuid        | NOT NULL | --                  | Parent MFA configuration. FK to `sec.mfa_config`.                   |
| credential_id              | bytea       | NOT NULL | --                  | Opaque credential identifier returned by the authenticator.         |
| public_key                 | text        | NOT NULL | --                  | COSE public key for signature verification (base64 or PEM).         |
| counter                    | bigint      | YES      | --                  | Signature counter for clone detection.                              |
| aaguid                     | uuid        | YES      | --                  | Authenticator Attestation GUID identifying the authenticator model. |
| attestation                | text        | YES      | --                  | Attestation statement format (e.g. `packed`, `tpm`, `none`).        |
| transports                 | text[]      | YES      | --                  | Supported transports (e.g. `{'usb','nfc','ble','internal'}`).       |
| is_backup_eligible         | boolean     | YES      | --                  | Whether the credential can be backed up (FIDO2 BE flag).            |
| is_backup_state            | boolean     | YES      | --                  | Whether the credential is currently backed up (FIDO2 BS flag).      |
| is_discoverable_credential | boolean     | YES      | --                  | Whether the credential supports resident key / conditional UI.      |
| last_used_at               | timestamptz | YES      | --                  | When the credential was last used for authentication.               |
| verified_at                | timestamptz | YES      | --                  | When the credential was verified during enrollment.                 |
| created_at                 | timestamptz | NOT NULL | `now()`             | Row creation timestamp.                                             |
| created_by                 | text        | NOT NULL | --                  | Identity that created the credential.                               |

### Primary Key

`id` (uuid)

### Unique Constraints

- `webauthn_credential_id_uniq`: `(tenant_id, credential_id)` -- ensures credential IDs are unique per tenant

### Foreign Keys

| FK Column     | References         | On Delete |
| ------------- | ------------------ | --------- |
| tenant_id     | core.tenant(id)    | CASCADE   |
| mfa_config_id | sec.mfa_config(id) | CASCADE   |

### Indexes

| Index Name                         | Columns       | Notes                                           |
| ---------------------------------- | ------------- | ----------------------------------------------- |
| idx_webauthn_credential_mfa_config | mfa_config_id | Look up credentials by their parent MFA config. |

### Relationships

- **Parents**: `core.tenant` via `tenant_id`, `sec.mfa_config` via `mfa_config_id`

---

## sec.security_event

### Functional Description

An append-only security event log that records significant security-relevant actions across the platform. Events include authentication successes and failures, MFA verifications, password changes, permission escalations, suspicious activity detections, and administrative security actions. Each event captures the actor (principal), severity level, client metadata (IP address, user agent), and a correlation ID for tracing related events across distributed components. This table is designed for compliance auditing and security forensic analysis.

### Technical Details

| Column         | Type        | Nullable | Default             | Description                                                                           |
| -------------- | ----------- | -------- | ------------------- | ------------------------------------------------------------------------------------- |
| id             | uuid        | NOT NULL | `gen_random_uuid()` | Surrogate primary key.                                                                |
| tenant_id      | uuid        | NOT NULL | --                  | Owning tenant. FK to `core.tenant`.                                                   |
| principal_id   | uuid        | YES      | --                  | The principal involved in the event (NULL for system events). FK to `core.principal`. |
| event_type     | text        | NOT NULL | --                  | Event type identifier (e.g. `login_success`, `mfa_failed`, `password_changed`).       |
| severity       | text        | NOT NULL | `'info'`            | Event severity level.                                                                 |
| occurred_at    | timestamptz | NOT NULL | `now()`             | When the event occurred.                                                              |
| ip_address     | text        | YES      | --                  | Source IP address.                                                                    |
| user_agent     | text        | YES      | --                  | Client user agent string.                                                             |
| correlation_id | text        | YES      | --                  | Distributed tracing correlation ID.                                                   |
| details        | jsonb       | YES      | --                  | Event-specific structured payload.                                                    |
| created_at     | timestamptz | NOT NULL | `now()`             | Row creation timestamp (typically equals `occurred_at`).                              |

### Primary Key

`id` (uuid)

### Check Constraints

- `security_event_severity_chk`: `severity IN ('info', 'warning', 'critical')`

### Foreign Keys

| FK Column    | References         | On Delete |
| ------------ | ------------------ | --------- |
| tenant_id    | core.tenant(id)    | CASCADE   |
| principal_id | core.principal(id) | SET NULL  |

### Indexes

| Index Name                     | Columns                       | Notes                                                        |
| ------------------------------ | ----------------------------- | ------------------------------------------------------------ |
| idx_security_event_tenant_time | (tenant_id, occurred_at DESC) | Time-ordered event retrieval per tenant (most recent first). |
| idx_security_event_principal   | (tenant_id, principal_id)     | Events for a specific principal.                             |
| idx_security_event_type        | (tenant_id, event_type)       | Filter by event type within a tenant.                        |

### Relationships

- **Parents**: `core.tenant` via `tenant_id`, `core.principal` via `principal_id` (optional)

### Design Notes

This table is **append-only** by design. Rows should never be updated or deleted in normal operation. Archival and retention policies should use time-based partitioning or external archival processes.

---

## sec.trusted_device

### Functional Description

Maintains a registry of devices that a principal has explicitly trusted or that the system has recognized through repeated successful authentication. Trusted devices can bypass MFA challenges for a configured period (governed by `expires_at`), enabling a smoother user experience on recognized hardware. Each device is identified by a stable `device_id` and optionally by a browser fingerprint. The `is_trusted` flag controls whether MFA bypass is active, and `last_seen_at` tracks recency for risk-based authentication decisions.

### Technical Details

| Column             | Type        | Nullable | Default             | Description                                                 |
| ------------------ | ----------- | -------- | ------------------- | ----------------------------------------------------------- |
| id                 | uuid        | NOT NULL | `gen_random_uuid()` | Surrogate primary key.                                      |
| tenant_id          | uuid        | NOT NULL | --                  | Owning tenant. FK to `core.tenant`.                         |
| principal_id       | uuid        | NOT NULL | --                  | The principal who owns this device. FK to `core.principal`. |
| device_id          | text        | NOT NULL | --                  | Stable device identifier (application-generated).           |
| device_fingerprint | text        | YES      | --                  | Browser/device fingerprint hash.                            |
| device_name        | text        | YES      | --                  | User-assigned device name (e.g. `Work Laptop`).             |
| device_type        | text        | YES      | --                  | Device classification (e.g. `desktop`, `mobile`, `tablet`). |
| user_agent         | text        | YES      | --                  | User agent string at time of registration.                  |
| ip_address         | text        | YES      | --                  | IP address at time of registration.                         |
| is_trusted         | boolean     | NOT NULL | `false`             | Whether this device currently has MFA bypass trust.         |
| last_seen_at       | timestamptz | YES      | --                  | When the device was last seen in an authentication event.   |
| verified_at        | timestamptz | YES      | --                  | When the device trust was established.                      |
| expires_at         | timestamptz | YES      | --                  | When the device trust expires (NULL = no expiry).           |
| metadata           | jsonb       | YES      | --                  | Extensible metadata.                                        |
| created_at         | timestamptz | NOT NULL | `now()`             | Row creation timestamp.                                     |
| created_by         | text        | NOT NULL | --                  | Identity that created the record.                           |

### Primary Key

`id` (uuid)

### Unique Constraints

- `trusted_device_principal_id_uniq`: `(principal_id, device_id)` -- deferrable; one device record per principal per device ID

### Foreign Keys

| FK Column    | References         | On Delete |
| ------------ | ------------------ | --------- |
| tenant_id    | core.tenant(id)    | CASCADE   |
| principal_id | core.principal(id) | CASCADE   |

### Indexes

| Index Name                     | Columns                                           | Notes                                             |
| ------------------------------ | ------------------------------------------------- | ------------------------------------------------- |
| idx_trusted_device_principal   | (tenant_id, principal_id)                         | All devices for a principal.                      |
| idx_trusted_device_fingerprint | (tenant_id, device_fingerprint)                   | Lookup by fingerprint hash.                       |
| idx_trusted_device_trusted     | (tenant_id, principal_id) WHERE is_trusted = true | Partial index for currently trusted devices only. |

### Relationships

- **Parents**: `core.tenant` via `tenant_id`, `core.principal` via `principal_id`

---

## sec.password_history

### Functional Description

Records the hash of every password a principal has used, enabling password reuse prevention and breach detection. When a principal changes their password, the new hash is appended to this table. Before accepting a new password, the system checks the last N entries (configurable per tenant) to ensure the candidate password has not been used recently. The `changed_at` timestamp establishes a chronological chain for policy evaluation, and `changed_by` identifies whether the change was self-service or administrative.

### Technical Details

| Column        | Type        | Nullable | Default             | Description                                                       |
| ------------- | ----------- | -------- | ------------------- | ----------------------------------------------------------------- |
| id            | uuid        | NOT NULL | `gen_random_uuid()` | Surrogate primary key.                                            |
| tenant_id     | uuid        | NOT NULL | --                  | Owning tenant. FK to `core.tenant`.                               |
| principal_id  | uuid        | NOT NULL | --                  | The principal whose password was changed. FK to `core.principal`. |
| password_hash | text        | NOT NULL | --                  | Hashed password (bcrypt/argon2).                                  |
| changed_at    | timestamptz | NOT NULL | `now()`             | When the password was changed.                                    |
| changed_by    | text        | NOT NULL | --                  | Identity that initiated the change (self or admin).               |

### Primary Key

`id` (uuid)

### Foreign Keys

| FK Column    | References         | On Delete |
| ------------ | ------------------ | --------- |
| tenant_id    | core.tenant(id)    | CASCADE   |
| principal_id | core.principal(id) | CASCADE   |

### Indexes

| Index Name                     | Columns                                    | Notes                                                  |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------ |
| idx_password_history_principal | (tenant_id, principal_id, changed_at DESC) | Retrieve the most recent N passwords for reuse checks. |

### Relationships

- **Parents**: `core.tenant` via `tenant_id`, `core.principal` via `principal_id`

### Design Notes

This table is effectively **append-only**. Old entries may be purged by retention policies, but rows should never be updated. The `password_hash` column stores only one-way hashes -- never plaintext passwords.

---

## sec.verify_mfa_challenge() (Function)

### Functional Description

A PL/pgSQL function that atomically verifies an in-flight MFA challenge. It implements the complete verification lifecycle: fetching the pending challenge, checking expiration, enforcing the attempt limit, comparing the submitted code against the stored secret, and updating the challenge status. All state transitions occur within a single function call, preventing race conditions and ensuring consistent security enforcement.

### Signature

```sql
sec.verify_mfa_challenge(p_challenge_id uuid, p_code text)
RETURNS TABLE (success boolean, message text, challenge_id uuid, verified_at timestamptz)
```

### Parameters

| Parameter      | Type | Description                                    |
| -------------- | ---- | ---------------------------------------------- |
| p_challenge_id | uuid | The ID of the pending MFA challenge to verify. |
| p_code         | text | The verification code submitted by the user.   |

### Return Columns

| Column       | Type        | Description                                                    |
| ------------ | ----------- | -------------------------------------------------------------- |
| success      | boolean     | Whether the verification succeeded.                            |
| message      | text        | Human-readable result message.                                 |
| challenge_id | uuid        | The challenge ID (returned on success, NULL on failure).       |
| verified_at  | timestamptz | Verification timestamp (returned on success, NULL on failure). |

### Behavior

1. **Fetch the challenge**: Looks up the challenge by ID, filtering for `status = 'pending'` and `expires_at > now()`.
2. **Not found / expired**: Returns `(false, 'Challenge not found or expired', NULL, NULL)`.
3. **Max attempts exceeded**: If `attempts >= max_attempts`, sets the challenge status to `'failed'` and returns `(false, 'Max attempts exceeded', NULL, NULL)`.
4. **Code verification**: Compares `p_code` against the stored `secret`.
   - **Match**: Updates the challenge to `status = 'verified'`, sets `verified_at = now()`, and returns `(true, 'Challenge verified', challenge_id, now())`.
   - **Mismatch**: Increments the `attempts` counter and returns `(false, 'Invalid code', NULL, NULL)`.

### Properties

- **Language**: PL/pgSQL
- **Atomicity**: All reads and writes occur within a single function execution, providing implicit transaction safety.

### Security Considerations

- The function uses a simple equality comparison (`secret = p_code`) for code matching. In production, TOTP verification should use a time-window-aware comparison; this is handled by the application layer before calling the function, or the function may be extended.
- Failed attempts are counted before returning, ensuring the attempt limit cannot be bypassed by concurrent requests.
- Expired challenges are rejected even if the code is correct.

---

## Entity-Relationship Summary

```
core.tenant
  |--- sec.mfa_challenge (tenant_id)
  |--- sec.mfa_config (tenant_id)
  |--- sec.totp_instance (tenant_id)
  |--- sec.email_otp_instance (tenant_id)
  |--- sec.sms_otp_instance (tenant_id)
  |--- sec.webauthn_credential (tenant_id)
  |--- sec.security_event (tenant_id)
  |--- sec.trusted_device (tenant_id)
  |--- sec.password_history (tenant_id)

core.principal
  |--- sec.mfa_challenge (principal_id)
  |--- sec.mfa_config (principal_id)
  |--- sec.security_event (principal_id, optional)
  |--- sec.trusted_device (principal_id)
  |--- sec.password_history (principal_id)

sec.mfa_config
  |--- sec.totp_instance (mfa_config_id)
  |--- sec.email_otp_instance (mfa_config_id)
  |--- sec.sms_otp_instance (mfa_config_id)
  |--- sec.webauthn_credential (mfa_config_id)
```

### MFA Configuration Hierarchy

The MFA tables form a two-level hierarchy:

1. **sec.mfa_config** -- One row per (principal, method_type) pair. Tracks enabled/verified/primary status, device binding, and backup codes. This is the central MFA management table.
2. **Method-specific detail tables** -- Each MFA method has its own child table linked via `mfa_config_id`:
   - `sec.totp_instance` -- TOTP secret, algorithm, period
   - `sec.email_otp_instance` -- Target email address
   - `sec.sms_otp_instance` -- Target phone number
   - `sec.webauthn_credential` -- Public key, credential ID, FIDO2 metadata

This normalized design allows the MFA subsystem to treat all methods uniformly at the config level while storing method-specific parameters in dedicated tables.
