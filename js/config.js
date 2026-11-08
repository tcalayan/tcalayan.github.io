/*
 * config.js — settings shared by several scripts.
 *
 * SHEET_URL = the Google Apps Script "Web app" URL (see setup/google-sheet-script.gs).
 * It receives BOTH the penguin ratings (js/feedback.js) and the visit analytics (js/analytics.js),
 * and sends back the "site_visits" number shown in the About Me panel.
 * While it's empty, nothing is saved (the data only shows up in the browser console) and the
 * visit counter stays hidden.
 */
window.SITE_CONFIG = {
  SHEET_URL: "https://script.google.com/macros/s/AKfycbzplsvZQ5itPLZrTLgsAFYtMvG5GtrwvmbmDFK7xTUhrnXEWVkffc3FEBp0-zhPtSCzAg/exec"
};
