Update the existing signup and login system with stronger security and modern authentication.

IMPORTANT:
This is part of the existing platform.
Do not redesign the whole app.
Only improve the authentication/signup flow and related UI.

==================================================
SIGNUP PAGE SECURITY REQUIREMENTS
==================================================

1. Signup form fields:
- Full name
- Email address
- Phone number
- Password
- Confirm password

2. Add password strength indicator:
- Weak
- Medium
- Strong

3. Add password rules:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

4. Add "I am not a robot" verification:
- Use Google reCAPTCHA or Cloudflare Turnstile
- Place it before the final Create Account button
- User cannot submit without passing verification

5. Add Terms checkbox:
- "I agree to the Terms and Privacy Policy"

6. Add security note:
"Your account is protected with email verification and anti-bot security."

==================================================
EMAIL VERIFICATION FLOW
==================================================

Before the account becomes fully active, verify the user's email address.

Signup flow:

Step 1:
User fills signup form

Step 2:
User completes "I am not a robot"

Step 3:
User clicks Create Account

Step 4:
System creates account with status:
email_verified = false
account_status = pending_verification

Step 5:
System sends verification email

Step 6:
Show verification pending page:
"Check your email to verify your account"

Page should include:
- User email address
- Resend verification email button
- Change email button
- Back to login button

Step 7:
When user clicks verification link:
- Verify token
- Mark email_verified = true
- account_status = active
- Redirect to login or dashboard

Important:
User should not access dashboard until email is verified.

==================================================
GOOGLE AUTH
==================================================

Add "Continue with Google" button to Login and Signup pages.

Flow:
- User clicks Continue with Google
- Google OAuth opens
- If email is new:
  - Create account automatically
  - Mark email_verified = true because Google already verified email
- If email already exists:
  - Log user in
- Redirect user to dashboard

UI:
- Google button must be clean and professional
- Include Google icon
- Text: "Continue with Google"

==================================================
GITHUB AUTH
==================================================

Add "Continue with GitHub" button to Login and Signup pages.

Flow:
- User clicks Continue with GitHub
- GitHub OAuth opens
- If account is new:
  - Create account
  - If GitHub email is verified, mark email_verified = true
  - If GitHub email is not available or not verified, ask user to add/verify email
- If account exists:
  - Log user in
- Redirect user to dashboard

UI:
- GitHub button must be clean and professional
- Include GitHub icon
- Text: "Continue with GitHub"

==================================================
LOGIN PAGE UPDATE
==================================================

Login page should include:

- Email/username field
- Password field
- Remember me
- Forgot password
- Login button

Social auth buttons:
- Continue with Google
- Continue with GitHub

If user tries to login without verified email:
Show message:
"Please verify your email before accessing your dashboard."

Include:
- Resend verification email button

==================================================
FORGOT PASSWORD SECURITY
==================================================

Forgot password flow:

1. User enters email
2. System sends reset link
3. Reset link expires after 15–30 minutes
4. User creates new password
5. Show success message

==================================================
ADMIN SIDE AUTH MONITORING
==================================================

Admin should be able to see user security status.

Users table should include:
- Email verified status
- Signup method:
  - Email/password
  - Google
  - GitHub
- Last login
- Account status

Admin actions:
- Resend verification email
- Manually verify email
- Suspend account
- View login activity

==================================================
DATABASE / BACKEND REQUIREMENTS
==================================================

User model should support:

- full_name
- email
- phone
- password_hash
- email_verified
- verification_token_hash
- verification_token_expires
- auth_provider: local / google / github
- google_id
- github_id
- account_status
- last_login
- created_at
- updated_at

Security:
- Never store plain passwords
- Hash passwords using bcrypt/argon2
- Verification tokens must expire
- Store hashed verification tokens, not plain tokens
- Rate-limit signup, login, resend verification, and forgot password
- Protect against duplicate email registration
- Use HTTPS in production

==================================================
UI STYLE
==================================================

- Match existing blue and white SaaS theme
- Clean auth cards
- Rounded inputs
- Soft shadows
- Professional social login buttons
- Mobile responsive
- Security-focused but simple

==================================================
FINAL GOAL
==================================================

The signup system should feel secure, modern, and trustworthy.

Users can register by:
1. Email/password + email verification
2. Google OAuth
3. GitHub OAuth

Bot protection must be added using reCAPTCHA or Cloudflare Turnstile before final registration.