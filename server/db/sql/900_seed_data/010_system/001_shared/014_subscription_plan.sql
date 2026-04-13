-- 900_seed_data/001_shared/014_subscription_plan.sql
-- Seed: Subscription plan tiers
-- Schema: shared | Table: subscription_plan
-- Idempotent: on conflict (code) do nothing

insert into shared.subscription_plan (code, name, max_users, sort_order, created_by) values
  ('trial',        'Trial',         5,    10, '00000000-0000-0000-0000-000000000000'),
  ('base',         'Base',          50,   20, '00000000-0000-0000-0000-000000000000'),
  ('starter',      'Starter',       200,  30, '00000000-0000-0000-0000-000000000000'),
  ('professional', 'Professional',  1000, 40, '00000000-0000-0000-0000-000000000000'),
  ('enterprise',   'Enterprise',    NULL, 50, '00000000-0000-0000-0000-000000000000')
on conflict (code) do nothing;
