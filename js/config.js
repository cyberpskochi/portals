/**
 * ============================================================================
 *  Cyber Crime PS, Kochi City — Duty Management System
 *  FRONT-END CONFIGURATION  (edit these two values — see SETUP-GUIDE.md)
 * ============================================================================
 *
 *  While either value still contains "PASTE_", the app runs in DEMO MODE:
 *  everything works, but data is kept only in this browser (nothing goes to
 *  Google Drive) — useful for trying the screens before deployment.
 */
window.APP_CONFIG = {
  // Google Cloud ▸ APIs & Services ▸ Credentials ▸ OAuth 2.0 Client ID (Web application)
  GOOGLE_CLIENT_ID: "891939995278-ig2u9ej2u7ft3q5sb4u9dbogceprv7bj.apps.googleusercontent.com",

  // Apps Script ▸ Deploy ▸ Web app URL (ends with /exec)
  API_URL: "https://script.google.com/macros/s/AKfycbxZbRIQ-FC0_8O8sr_ZaUWs9ST1M6OOnk6ClWt6unFW2mtjM_s4XxgC-X-y01PMp1jZ/exec",

  // Record the public IP address of the officer's network in the login log
  // (looked up once at sign-in via api.ipify.org). Set to false to disable.
  CAPTURE_PUBLIC_IP: true,

  // How often (seconds) the app checks Drive for changes made by other officers.
  POLL_SECONDS: 40
};
