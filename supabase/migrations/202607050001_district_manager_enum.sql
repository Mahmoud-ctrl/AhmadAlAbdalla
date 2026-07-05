-- Add the district_manager role value to the app_role enum.
-- Must be run alone and committed before any other statement references
-- the new value by name (Postgres disallows using a new enum value in the
-- same transaction that adds it).

alter type public.app_role add value if not exists 'district_manager';
