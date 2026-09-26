/**
 * External API for the GitHub Pages frontend.
 * Uses HtmlService + postMessage (CORS-safe).
 */

var EXTERNAL_REQUEST_USER_ = '';

/** The old default token was committed to the repo — never accept it. */
var KNOWN_PUBLIC_TOKENS_ = ['rr-central-2026-change-me'];
var MIN_API_TOKEN_LENGTH_ = 32;

/** Sites allowed to receive API results via postMessage. */
var ALLOWED_API_ORIGINS_ = [
  'https://redreach-repo.github.io',
  'https://redreach.ae',
  'https://www.redreach.ae',
  'http://localhost:5173'
];

function constantTimeEquals_(a, b) {
  a = String(a || '');
  b = String(b || '');
  var diff = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * The external API and migration export are disabled unless an admin sets a
 * random apiToken (32+ characters) in App Settings. Generate one with:
 *   Utilities.getUuid() + Utilities.getUuid()
 */
function requireApiToken_(token) {
  var expected = getApiToken_();
  if (
    !expected ||
    expected.length < MIN_API_TOKEN_LENGTH_ ||
    KNOWN_PUBLIC_TOKENS_.indexOf(expected) !== -1
  ) {
    throw new Error(
      'External API is disabled. An admin must set a random apiToken (32+ characters) in App Settings.'
    );
  }
  if (!constantTimeEquals_(token, expected)) {
    throw new Error('Invalid API token');
  }
}

function getApiToken_() {
  try {
    var t = String(getSettings().apiToken || '').trim();
    if (t) return t;
  } catch (e) {}
  return String(CONFIG.API_TOKEN || '').trim();
}

function setExternalRequestUser_(email) {
  EXTERNAL_REQUEST_USER_ = String(email || '').toLowerCase().trim();
}

function clearExternalRequestUser_() {
  EXTERNAL_REQUEST_USER_ = '';
}

function getApiHandler_(fnName) {
  var map = {
    getBootstrap: getBootstrap,
    getDashboard: getDashboard,
    getSettings: getSettings,
    saveSettings: saveSettings,
    getIdentityInfo: getIdentityInfo,
    getCalendarStatus: getCalendarStatus,
    authorizeGoogleCalendar: authorizeGoogleCalendar,
    syncAllFollowUpsToCalendar: syncAllFollowUpsToCalendar,
    listCrm: listCrm,
    saveCrm: saveCrm,
    deleteCrm: deleteCrm,
    listClients: listClients,
    listQuotes: listQuotes,
    getQuote: getQuote,
    saveQuote: saveQuote,
    finalizeQuote: finalizeQuote,
    undoFinalizeQuote: undoFinalizeQuote,
    setQuoteOutcome: setQuoteOutcome,
    deleteQuote: deleteQuote,
    reviseQuote: reviseQuote,
    duplicateQuote: duplicateQuote,
    clearAllDraftQuotes: clearAllDraftQuotes,
    listInvoices: listInvoices,
    getInvoice: getInvoice,
    saveInvoice: saveInvoice,
    duplicateInvoice: duplicateInvoice,
    deleteInvoice: deleteInvoice,
    convertQuoteToInvoice: convertQuoteToInvoice,
    recordPayment: recordPayment,
    markInvoicePaid: markInvoicePaid,
    listCatalog: listCatalog,
    saveCatalogItem: saveCatalogItem,
    deleteCatalogItem: deleteCatalogItem,
    listTemplates: listTemplates,
    saveTemplate: saveTemplate,
    deleteTemplate: deleteTemplate,
    createQuoteFromTemplate: createQuoteFromTemplate,
    listExpenses: listExpenses,
    saveExpense: saveExpense,
    getFollowUps: getFollowUps,
    snoozeFollowUp: snoozeFollowUp,
    clearFollowUp: clearFollowUp,
    addFollowUpUpdate: addFollowUpUpdate,
    listFollowUpUpdates: listFollowUpUpdates,
    getClientTimeline: getClientTimeline,
    getReports: getReports,
    exportReportCsv: exportReportCsv,
    globalSearch: globalSearch,
    listUsers: listUsers,
    saveUser: saveUser,
    deleteUser: deleteUser,
    listAttachments: listAttachments,
    uploadAttachment: uploadAttachment,
    deleteAttachment: deleteAttachment,
    getPortalInfo: getPortalInfo,
    getDocumentUrl: getDocumentUrl,
    getWhatsAppShare: getWhatsAppShare,
    previewNextReference: previewNextReference,
    installDailyMaintenanceTrigger: installDailyMaintenanceTrigger,
    exportMigrationDump: exportMigrationDump
  };
  return map[fnName] || null;
}

function dispatchExternalApi_(fnName, args, userEmail, token) {
  requireApiToken_(token);
  fnName = String(fnName || '').trim();
  var fn = getApiHandler_(fnName);
  if (!fn) throw new Error('Function not allowed: ' + fnName);

  setExternalRequestUser_(userEmail);
  try {
    var argv = args;
    if (typeof argv === 'string') {
      try { argv = JSON.parse(argv); } catch (e2) { argv = []; }
    }
    if (!argv) argv = [];
    if (!argv.length) return fn();
    return fn.apply(null, argv);
  } finally {
    clearExternalRequestUser_();
  }
}

function serveExternalApiPage_(params) {
  var reqId = params.reqId || '';
  var origin = String(params.origin || '');
  if (ALLOWED_API_ORIGINS_.indexOf(origin) === -1) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Origin not allowed' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var payload;
  try {
    var result = dispatchExternalApi_(
      params.fn,
      params.args,
      params.userEmail || params.email,
      params.token
    );
    payload = { ok: true, reqId: reqId, result: result };
  } catch (err) {
    payload = {
      ok: false,
      reqId: reqId,
      error: String(err.message || err)
    };
  }
  var json = JSON.stringify(payload)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/<\/script/gi, '<\\/script');
  var html =
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>API</title></head><body>' +
    '<script>(function(){var p=' + json + ';' +
    'function send(w){try{w.postMessage(p,' + JSON.stringify(origin) + ');}catch(e){}}' +
    'send(parent);send(top);if(window.frames){try{send(window.parent);}catch(e2){}}' +
    '})();</script></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
