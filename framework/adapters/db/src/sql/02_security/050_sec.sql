/* ============================================================================
   Athyper — SEC Schema
   MFA: Challenges, Configs, TOTP, Email/SMS OTP, WebAuthn
   Security: Events, Trusted Devices, Password History

   PostgreSQL 16+
   ============================================================================ */

-- ============================================================================
-- SEC: MFA Challenge (in-flight authentication challenge)
-- ============================================================================
create table if not exists sec.mfa_challenge (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenant(id) on delete cascade,
  principal_id   uuid not null references core.principal(id) on delete cascade,

  challenge_type text not null,
  challenge_data jsonb not null,
  secret         text not null,

  attempts       int not null default 0,
  max_attempts   int not null default 3,

  status         text not null default 'pending',
  verified_at    timestamptz,
  expires_at     timestamptz not null default (now() + interval '10 minutes'),

  created_at     timestamptz not null default now(),
  created_by     text not null,

  constraint mfa_challenge_type_chk check (challenge_type in ('totp','email','sms','webauthn','backup')),
  constraint mfa_challenge_status_chk check (status in ('pending','verified','expired','failed'))
);

comment on table sec.mfa_challenge is 'In-flight MFA challenges (time-limited, single-use).';

create index if not exists idx_mfa_challenge_principal
  on sec.mfa_challenge (tenant_id, principal_id, status);

create index if not exists idx_mfa_challenge_expires
  on sec.mfa_challenge (expires_at) where status = 'pending';

-- ============================================================================
-- SEC: MFA Configuration (authenticator settings per principal)
-- ============================================================================
create table if not exists sec.mfa_config (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenant(id) on delete cascade,
  principal_id   uuid not null references core.principal(id) on delete cascade,

  method_type    text not null,
  is_enabled     boolean not null default false,
  is_verified    boolean not null default false,
  is_primary     boolean not null default false,

  secret         text,
  backup_codes   text[],

  device_name    text,
  device_id      text,
  device_info    jsonb,

  last_used_at   timestamptz,
  verified_at    timestamptz,

  metadata       jsonb,

  created_at     timestamptz not null default now(),
  created_by     text not null,
  updated_at     timestamptz,
  updated_by     text,

  constraint mfa_config_method_chk check (method_type in ('totp','email','sms','webauthn')),
  constraint mfa_config_principal_method_uniq unique (principal_id, method_type) deferrable
);

comment on table sec.mfa_config is 'Principal MFA authenticator configurations.';

create index if not exists idx_mfa_config_principal
  on sec.mfa_config (tenant_id, principal_id);

create index if not exists idx_mfa_config_enabled
  on sec.mfa_config (tenant_id, principal_id) where is_enabled = true;

create index if not exists idx_mfa_config_primary
  on sec.mfa_config (principal_id) where is_primary = true;

-- ============================================================================
-- SEC: TOTP (Time-based OTP) Instance
-- ============================================================================
create table if not exists sec.totp_instance (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenant(id) on delete cascade,
  mfa_config_id  uuid not null references sec.mfa_config(id) on delete cascade,

  secret         text not null,
  algorithm      text not null default 'SHA1',
  digits         int not null default 6,
  period         int not null default 30,

  qr_code_url    text,
  manual_entry_key text,

  last_counter   int,
  last_verified_at timestamptz,

  created_at     timestamptz not null default now(),
  created_by     text not null
);

comment on table sec.totp_instance is 'TOTP secret and configuration.';

create index if not exists idx_totp_instance_mfa_config
  on sec.totp_instance (mfa_config_id);

-- ============================================================================
-- SEC: Email OTP Instance
-- ============================================================================
create table if not exists sec.email_otp_instance (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenant(id) on delete cascade,
  mfa_config_id  uuid not null references sec.mfa_config(id) on delete cascade,

  email_address  text not null,
  verified_at    timestamptz,

  created_at     timestamptz not null default now(),
  created_by     text not null,
  updated_at     timestamptz,
  updated_by     text
);

comment on table sec.email_otp_instance is 'Email OTP configuration.';

create index if not exists idx_email_otp_instance_mfa_config
  on sec.email_otp_instance (mfa_config_id);

create index if not exists idx_email_otp_instance_email
  on sec.email_otp_instance (tenant_id, email_address);

-- ============================================================================
-- SEC: SMS OTP Instance
-- ============================================================================
create table if not exists sec.sms_otp_instance (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenant(id) on delete cascade,
  mfa_config_id  uuid not null references sec.mfa_config(id) on delete cascade,

  phone_number   text not null,
  verified_at    timestamptz,

  created_at     timestamptz not null default now(),
  created_by     text not null,
  updated_at     timestamptz,
  updated_by     text
);

comment on table sec.sms_otp_instance is 'SMS OTP configuration.';

create index if not exists idx_sms_otp_instance_mfa_config
  on sec.sms_otp_instance (mfa_config_id);

create index if not exists idx_sms_otp_instance_phone
  on sec.sms_otp_instance (tenant_id, phone_number);

-- ============================================================================
-- SEC: WebAuthn Credential
-- ============================================================================
create table if not exists sec.webauthn_credential (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenant(id) on delete cascade,
  mfa_config_id  uuid not null references sec.mfa_config(id) on delete cascade,

  credential_id  bytea not null,
  public_key     text not null,
  counter        bigint,
  aaguid         uuid,
  attestation    text,

  transports     text[],
  is_backup_eligible boolean,
  is_backup_state boolean,
  is_discoverable_credential boolean,

  last_used_at   timestamptz,
  verified_at    timestamptz,

  created_at     timestamptz not null default now(),
  created_by     text not null,

  constraint webauthn_credential_id_uniq unique (tenant_id, credential_id)
);

comment on table sec.webauthn_credential is 'WebAuthn passkey/security key credentials.';

create index if not exists idx_webauthn_credential_mfa_config
  on sec.webauthn_credential (mfa_config_id);

-- ============================================================================
-- SEC: Security Event Log
-- ============================================================================
create table if not exists sec.security_event (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenant(id) on delete cascade,

  principal_id   uuid references core.principal(id) on delete set null,
  event_type     text not null,
  severity       text not null default 'info',

  occurred_at    timestamptz not null default now(),
  ip_address     text,
  user_agent     text,
  correlation_id text,

  details        jsonb,

  created_at     timestamptz not null default now(),

  constraint security_event_severity_chk check (severity in ('info','warning','critical'))
);

comment on table sec.security_event is 'Append-only security event log.';

create index if not exists idx_security_event_tenant_time
  on sec.security_event (tenant_id, occurred_at desc);

create index if not exists idx_security_event_principal
  on sec.security_event (tenant_id, principal_id);

create index if not exists idx_security_event_type
  on sec.security_event (tenant_id, event_type);

-- ============================================================================
-- SEC: Device Registry & Trust
-- ============================================================================
create table if not exists sec.trusted_device (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenant(id) on delete cascade,
  principal_id   uuid not null references core.principal(id) on delete cascade,

  device_id      text not null,
  device_fingerprint text,
  device_name    text,
  device_type    text,

  user_agent     text,
  ip_address     text,

  is_trusted     boolean not null default false,
  last_seen_at   timestamptz,

  verified_at    timestamptz,
  expires_at     timestamptz,

  metadata       jsonb,

  created_at     timestamptz not null default now(),
  created_by     text not null,

  constraint trusted_device_principal_id_uniq unique (principal_id, device_id) deferrable
);

comment on table sec.trusted_device is 'Trusted device registry (for MFA bypass, device-based auth).';

create index if not exists idx_trusted_device_principal
  on sec.trusted_device (tenant_id, principal_id);

create index if not exists idx_trusted_device_fingerprint
  on sec.trusted_device (tenant_id, device_fingerprint);

create index if not exists idx_trusted_device_trusted
  on sec.trusted_device (tenant_id, principal_id) where is_trusted = true;

-- ============================================================================
-- SEC: Password History (breach detection, reuse prevention)
-- ============================================================================
create table if not exists sec.password_history (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenant(id) on delete cascade,
  principal_id   uuid not null references core.principal(id) on delete cascade,

  password_hash  text not null,
  changed_at     timestamptz not null default now(),
  changed_by     text not null
);

comment on table sec.password_history is 'Password history for reuse detection and breach tracking.';

create index if not exists idx_password_history_principal
  on sec.password_history (tenant_id, principal_id, changed_at desc);

-- ============================================================================
-- FUNCTION: verify_mfa_challenge()
-- ============================================================================
create or replace function sec.verify_mfa_challenge(
  p_challenge_id uuid,
  p_code text
)
returns table (
  success boolean,
  message text,
  challenge_id uuid,
  verified_at timestamptz
) as $$
declare
  v_challenge sec.mfa_challenge;
  v_code_match boolean;
begin
  -- Fetch challenge
  select * into v_challenge
    from sec.mfa_challenge
   where id = p_challenge_id
     and status = 'pending'
     and expires_at > now();

  if v_challenge is null then
    return query select false, 'Challenge not found or expired'::text, null::uuid, null::timestamptz;
    return;
  end if;

  if v_challenge.attempts >= v_challenge.max_attempts then
    update sec.mfa_challenge
       set status = 'failed'
     where id = p_challenge_id;
    return query select false, 'Max attempts exceeded'::text, null::uuid, null::timestamptz;
    return;
  end if;

  -- Verify code (simple match for now)
  v_code_match := (v_challenge.secret = p_code);

  if v_code_match then
    update sec.mfa_challenge
       set status = 'verified',
           verified_at = now()
     where id = p_challenge_id;

    return query select true, 'Challenge verified'::text, p_challenge_id, now();
  else
    update sec.mfa_challenge
       set attempts = attempts + 1
     where id = p_challenge_id;

    return query select false, 'Invalid code'::text, null::uuid, null::timestamptz;
  end if;
end;
$$ language plpgsql;

comment on function sec.verify_mfa_challenge(uuid, text) is
'Verify an in-flight MFA challenge code.';
