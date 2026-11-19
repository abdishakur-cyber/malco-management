# GODOL People on Railway

This package uses the existing GODOL dashboard and role checks with Node.js,
PostgreSQL and email/password sign-in. It starts with the original fictional
demo workspace. It does not contain employee records exported from the live
site.

1. Upload the unpacked project to a private GitHub repository and connect that
   repository to the GODOL People service in the Railway project.
2. In the app service variables, set `DATABASE_URL` to
   `${{Postgres.DATABASE_URL}}` and `GODOL_OWNER_EMAIL` to the administrator's
   email. Set `APP_ORIGIN` to the exact HTTPS origin you will open in the
   browser, without a path. Generate a Railway service domain for testing and
   use that domain initially. When switching to a verified custom domain,
   update `APP_ORIGIN` to that origin.
3. Deploy. The Dockerfile installs and builds the app, and Railway checks
   `/healthz`. The app initializes its tables in PostgreSQL at startup.
4. Open a shell inside the running app service via Railway SSH. Use a Bash
   shell and run the following, substituting the account email. The password
   is read without echo and must have 12–128 characters.

   ```bash
   read -rs -p 'New password: ' godol_account_password; printf '\n'
   printf '%s' "$godol_account_password" | npm run account -- admin@example.com
   unset godol_account_password
   ```

5. Sign in at the configured URL. To add an HR or Staff account, first assign
   its email and role in the dashboard under Workspace access, then run the
   same command for that email. For Staff, link the email to the employee
   profile. Resetting a password ends that account's sessions. Removing a
   member removes the corresponding login and sessions.

Passwords are provisioned or reset by the operator using the shell command.
There is no public registration or self-service password reset. Keep this
environment on fictional data until access and migration are verified.
