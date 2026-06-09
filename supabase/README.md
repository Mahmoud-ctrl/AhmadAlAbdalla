# Supabase Auth Rules

This app does not allow manager self-signup.

Managers are created only by a super admin through server-side code that uses the Supabase service role key. The browser must never receive `SUPABASE_SERVICE_ROLE_KEY`.

Required Supabase dashboard settings:

- Disable public signups.
- Use username + password in the app. Internally, the username is converted to an email like `super.admin@alabdallah.internal` because Supabase Auth does not support native username/password login.
- Enable Email provider for password login.
- Phone provider is not needed.
- Mobile number is profile/contact data only.
- Do not enable SMS OTP login for managers.

First-time setup:

- Set `SUPABASE_SERVICE_ROLE_KEY` and `SETUP_SECRET` in the server environment.
- Visit `/setup`.
- Create the first super admin account.
- After one super admin exists, `/setup` refuses to create another one.
- Alternative local script:
  `npm run create:super-admin -- --username super.admin --mobile +96170123456 --password "ChangeMe123!" --full-name "Super Admin"`
- PowerShell/npm fallback form:
  `npm run create:super-admin -- super.admin +96170123456 "ChangeMe123!" "Super Admin"`

Access model:

- A Supabase Auth user is not enough to access the app.
- The user must also have an active row in `public.user_profiles`.
- Branch managers must have a `branch_id`.
- Super admins must have `branch_id = null`.

If a user somehow exists in `auth.users` without a matching active profile, the app should treat them as unauthorized and sign them out.
