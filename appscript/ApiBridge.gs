/**
 * External API for the GitHub Pages frontend.
 * Uses HtmlService + postMessage (CORS-safe).
 */

var EXTERNAL_REQUEST_USER_ = '';

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
  var expected = getApiToken_();
  if (expected && String(token || '') !== expected) {
    throw new Error('Invalid API token — copy apiToken from App Settings into web/config.js');
  }
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
  var origin = params.origin || '*';
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
    'function send(w){try{w.postMessage(p,"*");}catch(e){}}' +
    'send(parent);send(top);if(window.frames){try{send(window.parent);}catch(e2){}}' +
    '})();</script></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
