/**
 * One-shot migration dump for the React CRM (snake_case IndexedDB / Supabase shape).
 */

function exportMigrationDump() {
  ensureAppSheets_();

  var settingsMap = getSettings() || {};
  var app_settings = Object.keys(settingsMap).map(function (k) {
    return { key: k, value: String(settingsMap[k] == null ? '' : settingsMap[k]) };
  });

  var crmRows = listCrm();
  var crm = crmRows.map(function (r) {
    return {
      id: 'crm-' + r.row,
      company_name: r.companyName || '',
      primary_contact: r.primaryContact || '',
      email_phone: r.email || '',
      mobile_number: r.mobile || '',
      office_number: r.office || '',
      notes: r.notes || '',
      follow_up_date: normalizeMigrationDate_(r.followUpDate),
      next_action: r.nextAction || '',
      owner: r.owner || '',
      quote_ref: r.quoteRef || '',
      calendar_event_id: r.calendarEventId || '',
      created_by: r.createdBy || '',
      updated_by: r.updatedBy || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _sheet_row: r.row
    };
  });

  var rowToCrmId = {};
  crm.forEach(function (c) { rowToCrmId[c._sheet_row] = c.id; });

  var clients = listClients().map(function (c, idx) {
    return {
      id: c.id ? String(c.id) : 'client-' + (idx + 1),
      company_name: c.companyName || '',
      primary_contact: c.primaryContact || '',
      email: c.email || '',
      mobile: c.mobile || '',
      office: c.office || '',
      address: c.address || '',
      trn: c.trn || '',
      notes: c.notes || '',
      created_at: normalizeMigrationDate_(c.createdAt) || new Date().toISOString()
    };
  });

  var quotations = listQuotes().map(function (q) {
    var qid = String(q.quoteId || '').trim();
    var badIds = { 'Medical tourism':1, Tours:1, Trading:1, 'Marketing Consultancy':1, 'Virtual assistance':1, Uniform:1 };
    if (!qid || badIds[qid] || (qid.indexOf('Q-') !== 0 && qid.indexOf('RR-') !== 0)) {
      qid = 'Q-ROW-' + q.row;
    }
    return {
      id: 'quote-' + q.row,
      client: q.client || '',
      vertical: q.vertical || '',
      reference_number: q.reference || '',
      date: normalizeMigrationDate_(q.date),
      description: q.description || '',
      amount: Number(q.amount) || 0,
      status: q.status || 'Draft',
      division_code: (function(c){ c=String(c==null?'01':c).trim(); return /^\d+$/.test(c)?('00'+c).slice(-2):(c||'01'); })(q.divisionCode),
      base_reference: q.baseReference || '',
      revision: Number(q.revision) || 0,
      quote_id: qid,
      payment_terms: q.paymentTerms || '',
      moq: q.moq === '' || q.moq == null ? '' : String(q.moq),
      notes: q.notes || '',
      delivery_terms: q.deliveryTerms || '',
      outcome_reason: q.outcomeReason || '',
      created_by: q.createdBy || '',
      updated_by: q.updatedBy || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  });

  var invoices = listInvoices().map(function (inv) {
    return {
      id: 'invoice-' + inv.row,
      client: inv.client || '',
      vertical: inv.vertical || '',
      reference_number: inv.reference || '',
      date: normalizeMigrationDate_(inv.date),
      description: inv.description || '',
      amount: Number(inv.amount) || 0,
      status: inv.status || 'Draft',
      payment_status: inv.paymentStatus || 'Pending',
      payment_terms: inv.paymentTerms || '',
      moq: inv.moq === '' || inv.moq == null ? '' : String(inv.moq),
      notes: inv.notes || '',
      delivery_terms: inv.deliveryTerms || '',
      created_by: inv.createdBy || '',
      updated_by: inv.updatedBy || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  });

  var lineSheet = getSheet_(CONFIG.SHEETS.LINE_ITEMS, true, LINE_ITEM_HEADERS);
  var line_items = sheetToObjects_(lineSheet, 1, LINE_ITEM_HEADERS.length).map(function (r, idx) {
    return {
      id: 'line-' + (r._row || idx + 1),
      doc_type: String(r['Doc Type'] || 'Quote') === 'Invoice' ? 'Invoice' : 'Quote',
      reference: String(r.Reference || ''),
      line_no: Number(r['Line No']) || (idx + 1),
      description: r.Description || '',
      qty: toNumber_(r.Qty),
      unit_price: toNumber_(r['Unit Price']),
      vat_rate: r['VAT Rate'] === '' || r['VAT Rate'] == null ? 0.05 : toNumber_(r['VAT Rate']),
      amount: toNumber_(r.Amount),
      vat_amount: toNumber_(r['VAT Amount']),
      line_total: toNumber_(r['Line Total']),
      remarks: r.Remarks || '',
      created_at: new Date().toISOString()
    };
  });

  var products = listCatalog().map(function (p, idx) {
    return {
      id: 'product-' + (p.sku || idx + 1),
      sku: p.sku || '',
      name: p.name || '',
      division_code: p.divisionCode || '01',
      unit_price: Number(p.unitPrice) || 0,
      moq: Number(p.moq) || 50,
      fabric: p.fabric || '',
      unit: p.unit || 'pcs',
      active: p.active !== false && String(p.active).toLowerCase() !== 'no',
      notes: p.notes || '',
      updated_at: normalizeMigrationDate_(p.updatedAt) || new Date().toISOString()
    };
  });

  var quote_templates = listTemplates().map(function (t) {
    var items = t.items;
    if (typeof items === 'string') {
      try { items = JSON.parse(items); } catch (e) { items = []; }
    }
    return {
      id: t.id || ('tpl-' + Utilities.getUuid()),
      name: t.name || '',
      division_code: t.divisionCode || '01',
      description: t.description || '',
      items_json: items || [],
      created_at: normalizeMigrationDate_(t.createdAt) || new Date().toISOString()
    };
  });

  var income = listIncome().map(function (r, idx) {
    return {
      id: 'income-' + (idx + 1),
      client_source: r.client || r.clientSource || '',
      category: r.category || '',
      reference_number: r.reference || r.referenceNumber || '',
      date: normalizeMigrationDate_(r.date),
      description: r.description || '',
      bill_amount: Number(r.billAmount) || 0,
      vat: Number(r.vat) || 0,
      total_amount: Number(r.totalAmount) || 0,
      status: r.status || '',
      payment_method: r.paymentMethod || '',
      payment_status: r.paymentStatus || ''
    };
  });

  var expenses = listExpenses().map(function (r, idx) {
    return {
      id: 'expense-' + (idx + 1),
      date: normalizeMigrationDate_(r.date),
      vendor: r.vendor || '',
      category: r.category || '',
      amount: Number(r.amount) || 0,
      payment_method: r.paymentMethod || '',
      references_text: r.references || r.reference || '',
      notes: r.notes || '',
      created_at: new Date().toISOString()
    };
  });

  var paySheet = getSheet_(CONFIG.SHEETS.PAYMENTS, true, PAYMENT_HEADERS);
  var payment_log = sheetToObjects_(paySheet).map(function (r, idx) {
    return {
      id: 'pay-' + (r._row || idx + 1),
      invoice_ref: r['Invoice Ref'] || '',
      client: r.Client || '',
      amount: toNumber_(r.Amount),
      method: r.Method || '',
      notes: r.Notes || '',
      user_email: r.User || '',
      balance_after: toNumber_(r['Balance After']),
      created_at: normalizeMigrationDateTime_(r.Timestamp)
    };
  });

  var fuSheet = getSheet_(CONFIG.SHEETS.FOLLOWUP_UPDATES, true, FOLLOWUP_UPDATE_HEADERS);
  var follow_up_updates = sheetToObjects_(fuSheet).map(function (r, idx) {
    var sheetRow = Number(r['CRM Row']) || 0;
    return {
      id: 'fu-' + (r._row || idx + 1),
      crm_id: sheetRow && rowToCrmId[sheetRow] ? rowToCrmId[sheetRow] : null,
      company: r.Company || '',
      update_text: r.Update || '',
      user_email: r.User || '',
      created_at: normalizeMigrationDateTime_(r.Timestamp)
    };
  });

  var app_users = listUsers().map(function (u) {
    return {
      id: 'user-' + String(u.email || '').toLowerCase(),
      email: String(u.email || '').toLowerCase(),
      name: u.name || '',
      role: String(u.role || 'sales').toLowerCase() === 'admin' ? 'admin' : 'sales',
      active: u.active !== false && String(u.active).toLowerCase() !== 'no' && String(u.active).toLowerCase() !== 'false',
      created_at: new Date().toISOString()
    };
  });

  var actSheet = getSheet_(CONFIG.SHEETS.ACTIVITY, true, ACTIVITY_HEADERS);
  var activity_log = sheetToObjects_(actSheet).slice(-500).map(function (r, idx) {
    return {
      id: 'act-' + (r._row || idx + 1),
      action: r.Action || '',
      entity: r.Entity || '',
      reference: r.Reference || '',
      details: r.Details || '',
      user_email: r.User || '',
      created_at: normalizeMigrationDateTime_(r.Timestamp)
    };
  });

  // Strip helper fields
  crm.forEach(function (c) { delete c._sheet_row; });

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: 'google-sheets',
    counts: {
      crm: crm.length,
      clients: clients.length,
      quotations: quotations.length,
      invoices: invoices.length,
      line_items: line_items.length,
      products: products.length,
      quote_templates: quote_templates.length,
      income: income.length,
      expenses: expenses.length,
      payment_log: payment_log.length,
      follow_up_updates: follow_up_updates.length,
      app_users: app_users.length,
      activity_log: activity_log.length,
      app_settings: app_settings.length
    },
    app_settings: app_settings,
    app_users: app_users,
    clients: clients,
    crm: crm,
    follow_up_updates: follow_up_updates,
    quotations: quotations,
    invoices: invoices,
    line_items: line_items,
    products: products,
    quote_templates: quote_templates,
    income: income,
    expenses: expenses,
    payment_log: payment_log,
    attachments: [],
    activity_log: activity_log
  };
}

function normalizeMigrationDate_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(value).trim();
  if (!s) return null;
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  var d = parseDate_(s);
  if (!d) return s;
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function normalizeMigrationDateTime_(value) {
  if (!value) return new Date().toISOString();
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return value.toISOString();
  }
  var s = String(value).trim();
  if (!s) return new Date().toISOString();
  var d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString();
  return s;
}

function serveMigrationExport_(params) {
  var token = params.token || '';
  var expected = getApiToken_();
  if (expected && String(token) !== expected) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Invalid token' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var dump = exportMigrationDump();
  return ContentService.createTextOutput(JSON.stringify(dump))
    .setMimeType(ContentService.MimeType.JSON)
    .downloadAsFile('rrcentral-migration.json');
}
