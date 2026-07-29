/**
 * Templates, search, duplicate, activity, enhanced dashboard helpers
 */

function logActivity_(action, entity, reference, details) {
  try {
    var sheet = getSheet_(CONFIG.SHEETS.ACTIVITY, true, ACTIVITY_HEADERS);
    var user = currentUserLabel_();
    var email = getCurrentUserEmail_();
    appendRows_(sheet, [[
      new Date(),
      action || '',
      entity || '',
      reference || '',
      details || '',
      email ? (user === email ? email : user + ' <' + email + '>') : user
    ]]);
  } catch (err) { /* non-blocking */ }
}

function getBootstrap() {
  ensureAppSheets_();
  // Expiry scan can be slow with many quotes — at most once per hour
  try {
    var cache = CacheService.getScriptCache();
    if (!cache.get('expire_quotes_ok')) {
      expireStaleQuotes_();
      cache.put('expire_quotes_ok', '1', 3600);
    }
  } catch (e) {
    try { expireStaleQuotes_(); } catch (e2) {}
  }
  var settings = getSettings();
  var role = getUserRole();
  return {
    settings: settings,
    divisions: CONFIG.DIVISIONS,
    verticals: CONFIG.VERTICALS,
    quoteStatuses: CONFIG.QUOTE_STATUSES,
    invoiceStatuses: CONFIG.INVOICE_STATUSES,
    paymentStatuses: CONFIG.PAYMENT_STATUSES,
    paymentMethods: CONFIG.PAYMENT_METHODS,
    paymentTermsOptions: CONFIG.PAYMENT_TERMS,
    deliveryTermsOptions: CONFIG.DELIVERY_TERMS,
    fabricOptions: CONFIG.FABRIC_OPTIONS || ['', 'GB', 'PV', 'TW'],
    nextActionOptions: CONFIG.NEXT_ACTIONS || [],
    teamOwners: listTeamOwners_(),
    roles: CONFIG.ROLES || ['admin', 'sales'],
    currency: CONFIG.CURRENCY,
    moqDefault: settings.moqDefault != null ? settings.moqDefault : (CONFIG.MOQ_DEFAULT || 50),
    user: role,
    portal: {
      baseUrl: settings.portalBaseUrl || CONFIG.PORTAL_DEFAULT,
      bilingualDefault: settings.bilingualDefault || 'en'
    }
  };
}

function listTeamOwners_() {
  var owners = [];
  var seen = {};
  try {
    listUsers().forEach(function (u) {
      if (!u.active) return;
      var email = String(u.email || '').toLowerCase();
      if (!email || seen[email]) return;
      seen[email] = true;
      var name = String(u.name || '').trim();
      owners.push({
        value: email,
        email: email,
        name: name,
        label: name ? (name + ' · ' + email) : email
      });
    });
  } catch (e) {}
  try {
    listCrm().forEach(function (c) {
      var o = String(c.owner || '').trim();
      if (!o) return;
      var key = o.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      owners.push({ value: o, email: resolveOwnerEmail_(o) || '', name: o, label: o });
    });
  } catch (e2) {}
  return owners;
}

function getDashboard() {
  ensureAppSheets_();
  var income = listIncome_();
  var expenses = listExpenses_();
  var invoices = listInvoices();
  var quotes = listQuotes();
  var crm = listCrm();
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  var totalIncome = income.reduce(function (s, r) { return s + toNumber_(r.totalAmount || r.billAmount); }, 0);
  var totalExpense = expenses.reduce(function (s, r) { return s + toNumber_(r.amount); }, 0);

  var unpaid = invoices.filter(function (i) {
    var ps = String(i.paymentStatus || '').toLowerCase();
    return ps !== 'paid';
  });
  var pendingInvoicesAmt = unpaid.reduce(function (s, i) { return s + toNumber_(i.amount); }, 0);

  var openQuotes = quotes.filter(function (q) {
    var st = String(q.status || '').toLowerCase();
    return st === 'draft' || st === 'finalized' || st === 'sent' || st === 'pending';
  });

  var byDivision = {};
  CONFIG.DIVISIONS.forEach(function (d) {
    byDivision[d.code] = { code: d.code, brand: d.brand, quotes: 0, amount: 0 };
  });
  quotes.forEach(function (q) {
    var code = q.divisionCode || getDivision_(q.vertical).code;
    if (!byDivision[code]) {
      byDivision[code] = { code: code, brand: q.divisionBrand || q.vertical, quotes: 0, amount: 0 };
    }
    byDivision[code].quotes += 1;
    byDivision[code].amount += toNumber_(q.amount);
  });

  var followUps = crm.filter(function (c) {
    if (!c.followUpDate) return false;
    var d = parseDate_(c.followUpDate);
    if (!d) return false;
    return d.getTime() <= today.getTime() + 7 * 86400000;
  }).sort(function (a, b) {
    return String(a.followUpDate).localeCompare(String(b.followUpDate));
  }).slice(0, 10);

  var overdueFollowUps = crm.filter(function (c) {
    if (!c.followUpDate) return false;
    var d = parseDate_(c.followUpDate);
    if (!d) return false;
    d.setHours(0, 0, 0, 0);
    return d.getTime() < today.getTime();
  }).length;

  var monthIncome = income.filter(function (r) {
    var d = parseDate_(r.date);
    return d && d >= monthStart;
  }).reduce(function (s, r) { return s + toNumber_(r.totalAmount || r.billAmount); }, 0);

  var monthExpense = expenses.filter(function (r) {
    var d = parseDate_(r.date);
    return d && d >= monthStart;
  }).reduce(function (s, r) { return s + toNumber_(r.amount); }, 0);

  return {
    totals: {
      income: totalIncome,
      expense: totalExpense,
      net: totalIncome - totalExpense,
      pendingInvoices: pendingInvoicesAmt,
      unpaidCount: unpaid.length,
      crmCount: crm.length,
      quoteCount: quotes.length,
      invoiceCount: invoices.length,
      openQuotes: openQuotes.length,
      awardedQuotes: quotes.filter(function (q) {
        return String(q.status || '').toLowerCase() === 'awarded';
      }).length,
      monthIncome: monthIncome,
      monthExpense: monthExpense,
      monthNet: monthIncome - monthExpense,
      overdueFollowUps: overdueFollowUps
    },
    byDivision: Object.keys(byDivision).map(function (k) { return byDivision[k]; }),
    recentQuotes: quotes.slice(0, 6),
    recentInvoices: invoices.slice(0, 6),
    openQuotes: openQuotes.slice(0, 8),
    unpaidInvoices: unpaid.slice(0, 8),
    followUps: followUps,
    settings: getSettings(),
    user: getUserRole()
  };
}

function globalSearch(query) {
  var q = String(query || '').toLowerCase().trim();
  if (!q) return { clients: [], quotes: [], invoices: [], expenses: [] };

  function hit(obj, fields) {
    return fields.some(function (f) {
      return String(obj[f] || '').toLowerCase().indexOf(q) >= 0;
    });
  }

  return {
    clients: listCrm().filter(function (c) {
      return hit(c, ['companyName', 'primaryContact', 'email', 'mobile', 'notes']);
    }).slice(0, 12),
    quotes: listQuotes().filter(function (r) {
      return hit(r, ['reference', 'client', 'description', 'vertical', 'divisionBrand', 'status', 'quoteId']);
    }).slice(0, 12),
    invoices: listInvoices().filter(function (r) {
      return hit(r, ['reference', 'client', 'description', 'vertical', 'status', 'paymentStatus']);
    }).slice(0, 12),
    expenses: listExpenses().filter(function (r) {
      return hit(r, ['vendor', 'category', 'notes', 'references']);
    }).slice(0, 12)
  };
}

/* ========== Templates ========== */

function listTemplates() {
  ensureAppSheets_();
  var sheet = getSheet_(CONFIG.SHEETS.TEMPLATES, true, TEMPLATE_HEADERS);
  return sheetToObjects_(sheet).map(function (r) {
    var items = [];
    try { items = JSON.parse(r['Items JSON'] || '[]'); } catch (e) { items = []; }
    return {
      row: r._row,
      id: r['Template ID'] || '',
      name: r.Name || '',
      divisionCode: r['Division Code'] || '01',
      description: r.Description || '',
      items: items,
      createdAt: r['Created At'] || ''
    };
  }).reverse();
}

function saveTemplate(payload) {
  ensureAppSheets_();
  var sheet = getSheet_(CONFIG.SHEETS.TEMPLATES, true, TEMPLATE_HEADERS);
  var id = payload.id || ('T-' + Utilities.getUuid().slice(0, 8));
  var itemsJson = JSON.stringify(payload.items || []);
  var existing = listTemplates().filter(function (t) { return t.id === id; })[0];
  var row = [
    id,
    payload.name || 'Untitled template',
    payload.divisionCode || '01',
    payload.description || '',
    itemsJson,
    existing ? existing.createdAt : new Date()
  ];
  if (existing) setRowValues_(sheet, existing.row, row);
  else appendRows_(sheet, [row]);
  logActivity_('save_template', 'template', id, payload.name || '');
  return listTemplates();
}

function deleteTemplate(id) {
  var sheet = getSheet_(CONFIG.SHEETS.TEMPLATES, true, TEMPLATE_HEADERS);
  var all = listTemplates();
  for (var i = 0; i < all.length; i++) {
    if (all[i].id === id) {
      sheet.deleteRow(all[i].row);
      logActivity_('delete_template', 'template', id, '');
      break;
    }
  }
  return listTemplates();
}

function createQuoteFromTemplate(templateId, clientName) {
  var tpl = listTemplates().filter(function (t) { return t.id === templateId; })[0];
  if (!tpl) throw new Error('Template not found');
  var saved = saveQuote({
    client: clientName || '',
    divisionCode: tpl.divisionCode,
    description: tpl.description,
    date: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    items: tpl.items
  });
  logActivity_('quote_from_template', 'quote', saved.quote.quoteId, tpl.name);
  return saved;
}

function duplicateQuote(quoteIdOrRef) {
  var data = getQuote(quoteIdOrRef);
  var q = data.quote;
  var saved = saveQuote({
    client: q.client,
    divisionCode: q.divisionCode || getDivision_(q.vertical).code,
    description: q.description,
    paymentTerms: q.paymentTerms || '',
    moq: q.moq !== '' && q.moq != null ? q.moq : '',
    notes: q.notes || '',
    deliveryTerms: q.deliveryTerms || '',
    date: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    items: (data.items || []).map(function (i) {
      return { description: i.description, qty: i.qty, unitPrice: i.unitPrice, remarks: i.remarks || '' };
    })
  });
  logActivity_('duplicate_quote', 'quote', saved.quote.quoteId, 'from ' + (q.reference || q.quoteId));
  return saved;
}

function duplicateInvoice(reference) {
  var data = getInvoice(reference);
  var inv = data.invoice;
  var saved = saveInvoice({
    client: inv.client,
    divisionCode: getDivision_(inv.vertical).code,
    description: inv.description,
    paymentTerms: inv.paymentTerms || '',
    moq: inv.moq !== '' && inv.moq != null ? inv.moq : '',
    notes: inv.notes || '',
    deliveryTerms: inv.deliveryTerms || '',
    date: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    status: 'Draft',
    paymentStatus: 'Pending',
    items: (data.items || []).map(function (i) {
      return { description: i.description, qty: i.qty, unitPrice: i.unitPrice, remarks: i.remarks || '' };
    })
  });
  logActivity_('duplicate_invoice', 'invoice', saved.invoice.reference, 'from ' + reference);
  return saved;
}

function listActivity(limit) {
  ensureAppSheets_();
  var sheet = getSheet_(CONFIG.SHEETS.ACTIVITY, true, ACTIVITY_HEADERS);
  var rows = sheetToObjects_(sheet).reverse();
  return rows.slice(0, limit || 40).map(function (r) {
    return {
      timestamp: r.Timestamp || '',
      action: r.Action || '',
      entity: r.Entity || '',
      reference: r.Reference || '',
      details: r.Details || '',
      user: r.User || ''
    };
  });
}
