/**
 * Catalog, roles, reports, attachments, follow-ups, expiry, portal helpers
 */

function getCurrentUserEmail_() {
  if (EXTERNAL_REQUEST_USER_) return EXTERNAL_REQUEST_USER_;
  try {
    var active = String(Session.getActiveUser().getEmail() || '').toLowerCase().trim();
    if (active) return active;
  } catch (e) {}
  return '';
}

function getAppOwnerEmail_() {
  try {
    return String(Session.getEffectiveUser().getEmail() || '').toLowerCase().trim();
  } catch (e) {
    return '';
  }
}

/**
 * Friendly label for the signed-in Google account.
 * Uses Name from App Users when set; otherwise the email.
 */
function currentUserLabel_() {
  var email = getCurrentUserEmail_() || getAppOwnerEmail_();
  if (!email) return 'Unknown user';
  try {
    var users = listUsers();
    for (var i = 0; i < users.length; i++) {
      if (users[i].email === email && users[i].name) return String(users[i].name).trim();
    }
  } catch (e) {}
  return email;
}

function listUsers() {
  ensureAppSheets_();
  var sheet = getSheet_(CONFIG.SHEETS.USERS, true, USER_HEADERS);
  return sheetToObjects_(sheet).map(function (r) {
    return {
      row: r._row,
      email: String(r.Email || '').toLowerCase().trim(),
      role: String(r.Role || 'sales').toLowerCase(),
      name: r.Name || '',
      active: String(r.Active == null || r.Active === '' ? 'yes' : r.Active).toLowerCase() !== 'no'
    };
  }).filter(function (u) { return u.email; });
}

function getUserRole() {
  var email = getCurrentUserEmail_();
  var ownerEmail = getAppOwnerEmail_();
  // When ActiveUser is blank (common), fall back to the Google account that owns the app
  if (!email && ownerEmail) email = ownerEmail;

  var users = listUsers();
  var settings = getSettings();
  var adminEmails = String(settings.adminEmails || '')
    .split(/[,;\s]+/)
    .map(function (s) { return s.toLowerCase().trim(); })
    .filter(Boolean);
  // Hard-coded owners always count as admin (even if Settings row was cleared)
  (CONFIG.ADMIN_EMAILS || []).forEach(function (e) {
    e = String(e || '').toLowerCase().trim();
    if (e && adminEmails.indexOf(e) < 0) adminEmails.push(e);
  });

  // Script / spreadsheet owner is always admin
  if (ownerEmail && email === ownerEmail) {
    var ownerName = '';
    for (var o = 0; o < users.length; o++) {
      if (users[o].email === email && users[o].name) { ownerName = users[o].name; break; }
    }
    return {
      email: email,
      name: ownerName || (email ? email.split('@')[0] : ''),
      role: 'admin',
      openAccess: !users.length && !adminEmails.length,
      canEditSettings: true,
      canMarkPaid: true,
      isAppOwner: true
    };
  }

  if (!users.length && !adminEmails.length) {
    return {
      email: email,
      name: email ? email.split('@')[0] : '',
      role: 'admin',
      openAccess: true,
      canEditSettings: true,
      canMarkPaid: true,
      isAppOwner: !!(ownerEmail && email === ownerEmail)
    };
  }

  if (email && adminEmails.indexOf(email) >= 0) {
    var adminName = '';
    for (var a = 0; a < users.length; a++) {
      if (users[a].email === email && users[a].name) { adminName = users[a].name; break; }
    }
    return {
      email: email,
      name: adminName || (email ? email.split('@')[0] : ''),
      role: 'admin',
      openAccess: false,
      canEditSettings: true,
      canMarkPaid: true,
      isAppOwner: !!(ownerEmail && email === ownerEmail)
    };
  }

  for (var i = 0; i < users.length; i++) {
    if (users[i].email === email && users[i].active) {
      var role = users[i].role === 'admin' ? 'admin' : 'sales';
      return {
        email: email,
        role: role,
        name: users[i].name || email.split('@')[0],
        openAccess: false,
        canEditSettings: role === 'admin',
        canMarkPaid: role === 'admin',
        isAppOwner: !!(ownerEmail && email === ownerEmail)
      };
    }
  }

  // Unknown user with an access list configured → sales (read/write CRM/quotes, not settings/paid)
  if (users.length || adminEmails.length) {
    return {
      email: email,
      name: email ? email.split('@')[0] : '',
      role: 'sales',
      openAccess: false,
      canEditSettings: false,
      canMarkPaid: false,
      restricted: !email,
      isAppOwner: false
    };
  }
  return {
    email: email,
    name: email ? email.split('@')[0] : '',
    role: 'admin',
    openAccess: true,
    canEditSettings: true,
    canMarkPaid: true,
    isAppOwner: !!(ownerEmail && email === ownerEmail)
  };
}

/**
 * Who is signed in / who owns the app — for Settings identity panel.
 */
function getIdentityInfo() {
  var role = getUserRole();
  var owner = getAppOwnerEmail_();
  return {
    signedInEmail: role.email || '',
    signedInName: role.name || '',
    role: role.role,
    canEditSettings: !!role.canEditSettings,
    isAppOwner: !!role.isAppOwner,
    appOwnerEmail: owner,
    companyEmail: (getSettings().email || CONFIG.COMPANY.email || ''),
    note:
      'Team members sign in with a personal Google / Gmail account. ' +
      'Your Zoho address (e.g. info@redreach.ae) is only the company contact on quotes — it does not need to be a Google account.'
  };
}

function requireAdmin_(action) {
  var u = getUserRole();
  if (u.role !== 'admin') {
    throw new Error('Admin only' + (action ? ': ' + action : ''));
  }
  return u;
}

function saveUser(payload) {
  requireAdmin_('manage users');
  ensureAppSheets_();
  var sheet = getSheet_(CONFIG.SHEETS.USERS, true, USER_HEADERS);
  var email = String(payload.email || '').toLowerCase().trim();
  if (!email) throw new Error('Email is required');
  var role = String(payload.role || 'sales').toLowerCase() === 'admin' ? 'admin' : 'sales';
  var all = listUsers();
  var existing = null;
  for (var i = 0; i < all.length; i++) {
    if (all[i].email === email) { existing = all[i]; break; }
  }
  var row = [
    email,
    role,
    payload.name || '',
    payload.active === false || String(payload.active).toLowerCase() === 'no' ? 'no' : 'yes'
  ];
  if (existing) setRowValues_(sheet, existing.row, row);
  else appendRows_(sheet, [row]);
  logActivity_('save_user', 'user', email, role);
  return listUsers();
}

function deleteUser(email) {
  requireAdmin_('manage users');
  email = String(email || '').toLowerCase().trim();
  var sheet = getSheet_(CONFIG.SHEETS.USERS, true, USER_HEADERS);
  var all = listUsers();
  for (var i = 0; i < all.length; i++) {
    if (all[i].email === email) {
      sheet.deleteRow(all[i].row);
      logActivity_('delete_user', 'user', email, '');
      break;
    }
  }
  return listUsers();
}

/* ========== Catalog ========== */

function listCatalog(divisionCode) {
  ensureAppSheets_();
  var sheet = getSheet_(CONFIG.SHEETS.CATALOG, true, CATALOG_HEADERS);
  var rows = sheetToObjects_(sheet).map(function (r) {
    return {
      row: r._row,
      sku: r.SKU || '',
      name: r.Name || '',
      divisionCode: r['Division Code'] || '01',
      unitPrice: toNumber_(r['Unit Price']),
      moq: r.MOQ !== '' && r.MOQ != null ? toNumber_(r.MOQ) : '',
      fabric: r.Fabric || '',
      unit: r.Unit || 'pcs',
      active: String(r.Active == null || r.Active === '' ? 'yes' : r.Active).toLowerCase() !== 'no',
      notes: r.Notes || '',
      updatedAt: r['Updated At'] || ''
    };
  }).filter(function (c) { return c.sku || c.name; });

  if (divisionCode) {
    rows = rows.filter(function (c) {
      return !c.divisionCode || String(c.divisionCode) === String(divisionCode) || String(divisionCode) === 'all';
    });
  }
  return rows.reverse();
}

function saveCatalogItem(payload) {
  ensureAppSheets_();
  var sheet = getSheet_(CONFIG.SHEETS.CATALOG, true, CATALOG_HEADERS);
  var sku = String(payload.sku || '').trim() || ('SKU-' + Utilities.getUuid().slice(0, 6).toUpperCase());
  var all = listCatalog();
  var existing = null;
  for (var i = 0; i < all.length; i++) {
    if (all[i].sku === sku || (payload.row && all[i].row === Number(payload.row))) {
      existing = all[i];
      break;
    }
  }
  var row = [
    sku,
    payload.name || '',
    payload.divisionCode || '01',
    toNumber_(payload.unitPrice),
    payload.moq != null && payload.moq !== '' ? toNumber_(payload.moq) : '',
    payload.fabric || '',
    payload.unit || 'pcs',
    payload.active === false || String(payload.active).toLowerCase() === 'no' ? 'no' : 'yes',
    payload.notes || '',
    new Date()
  ];
  if (existing) setRowValues_(sheet, existing.row, row);
  else appendRows_(sheet, [row]);
  logActivity_('save_catalog', 'catalog', sku, payload.name || '');
  return listCatalog();
}

function deleteCatalogItem(skuOrRow) {
  var sheet = getSheet_(CONFIG.SHEETS.CATALOG, true, CATALOG_HEADERS);
  var all = listCatalog();
  var key = String(skuOrRow || '');
  for (var i = 0; i < all.length; i++) {
    if (all[i].sku === key || String(all[i].row) === key) {
      sheet.deleteRow(all[i].row);
      logActivity_('delete_catalog', 'catalog', all[i].sku, '');
      break;
    }
  }
  return listCatalog();
}

function catalogItemToLine_(item, qty) {
  var fabric = item.fabric ? (' [' + item.fabric + ']') : '';
  var moqNote = item.moq ? (' · MOQ ' + item.moq) : '';
  return {
    description: (item.name || item.sku) + fabric + moqNote,
    qty: qty != null ? Number(qty) : (item.moq || 1),
    unitPrice: toNumber_(item.unitPrice),
    sku: item.sku,
    fabric: item.fabric || '',
    moq: item.moq
  };
}

/* ========== Attachments ========== */

function getAttachmentsFolder_() {
  var name = 'RED REACH Central Attachments';
  var folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

function listAttachments(entityType, entityRef) {
  ensureAppSheets_();
  var sheet = getSheet_(CONFIG.SHEETS.ATTACHMENTS, true, ATTACHMENT_HEADERS);
  return sheetToObjects_(sheet).map(function (r) {
    return {
      row: r._row,
      id: r['Attachment ID'] || '',
      entityType: r['Entity Type'] || '',
      entityRef: r['Entity Ref'] || '',
      fileName: r['File Name'] || '',
      fileId: r['Drive File Id'] || '',
      url: r.Url || '',
      uploadedAt: r['Uploaded At'] || '',
      uploadedBy: r['Uploaded By'] || ''
    };
  }).filter(function (a) {
    if (!entityType) return true;
    return a.entityType === entityType && String(a.entityRef) === String(entityRef);
  }).reverse();
}

function uploadAttachment(payload) {
  ensureAppSheets_();
  var entityType = payload.entityType || 'quote';
  var entityRef = payload.entityRef || '';
  if (!entityRef) throw new Error('entityRef is required');
  var fileName = payload.fileName || 'attachment.bin';
  var mimeType = payload.mimeType || 'application/octet-stream';
  var base64 = String(payload.base64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!base64) throw new Error('File data missing');

  var blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, fileName);
  var folder = getAttachmentsFolder_();
  var file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}

  var id = 'ATT-' + Utilities.getUuid().slice(0, 8);
  var sheet = getSheet_(CONFIG.SHEETS.ATTACHMENTS, true, ATTACHMENT_HEADERS);
  appendRows_(sheet, [[
    id,
    entityType,
    entityRef,
    fileName,
    file.getId(),
    file.getUrl(),
    new Date(),
    getCurrentUserEmail_()
  ]]);
  logActivity_('upload_attachment', entityType, entityRef, fileName);
  return listAttachments(entityType, entityRef);
}

function deleteAttachment(attachmentId) {
  var sheet = getSheet_(CONFIG.SHEETS.ATTACHMENTS, true, ATTACHMENT_HEADERS);
  var all = listAttachments();
  for (var i = 0; i < all.length; i++) {
    if (all[i].id === attachmentId) {
      try {
        if (all[i].fileId) DriveApp.getFileById(all[i].fileId).setTrashed(true);
      } catch (e) {}
      sheet.deleteRow(all[i].row);
      logActivity_('delete_attachment', all[i].entityType, all[i].entityRef, all[i].fileName);
      break;
    }
  }
  return true;
}

/* ========== Follow-ups & expiry ========== */

function listFollowUpUpdates(limit) {
  ensureAppSheets_();
  var sheet = getSheet_(CONFIG.SHEETS.FOLLOWUP_UPDATES, true, FOLLOWUP_UPDATE_HEADERS);
  var rows = sheetToObjects_(sheet).map(function (r) {
    return {
      row: r._row,
      timestamp: r.Timestamp || '',
      company: r.Company || '',
      crmRow: r['CRM Row'] || '',
      update: r.Update || '',
      user: r.User || ''
    };
  }).filter(function (u) { return u.update; }).reverse();
  limit = Number(limit) || 40;
  return rows.slice(0, limit);
}

function addFollowUpUpdate(payload) {
  ensureAppSheets_();
  var text = String((payload && payload.update) || '').trim();
  if (!text) throw new Error('Update text is required');
  var company = String((payload && payload.company) || '').trim();
  var crmRow = payload && payload.crmRow ? Number(payload.crmRow) : '';
  if (crmRow && !company) {
    var crm = listCrm();
    for (var i = 0; i < crm.length; i++) {
      if (crm[i].row === crmRow) {
        company = crm[i].companyName || '';
        break;
      }
    }
  }
  var user = getCurrentUserEmail_();
  var sheet = getSheet_(CONFIG.SHEETS.FOLLOWUP_UPDATES, true, FOLLOWUP_UPDATE_HEADERS);
  var when = new Date();
  appendRows_(sheet, [[when, company, crmRow || '', text, user]]);

  // Keep CRM Notes/Outcome current so the contact record stays in sync
  if (crmRow && crmRow >= 2) {
    try {
      var crmSheet = getSheet_(CONFIG.SHEETS.CRM);
      var existingNotes = String(crmSheet.getRange(crmRow, 7).getValue() || '');
      var stamp = Utilities.formatDate(when, Session.getScriptTimeZone(), 'dd-MMM HH:mm');
      var who = user ? user.split('@')[0] : 'team';
      var line = '[' + stamp + ' · ' + who + '] ' + text;
      var nextNotes = existingNotes ? (line + '\n' + existingNotes) : line;
      // Cap stored notes length so the cell stays usable
      if (nextNotes.length > 4500) nextNotes = nextNotes.slice(0, 4500);
      crmSheet.getRange(crmRow, 7).setValue(nextNotes);
    } catch (e) { /* non-blocking */ }
  }

  logActivity_('followup_update', 'crm', company || String(crmRow || ''), text.slice(0, 120));
  return getFollowUps();
}

function getFollowUps() {
  ensureAppSheets_();
  expireStaleQuotes_();
  // Backfill follow-ups for open quotations that aren't tracked yet
  try { ensureOpenQuotesHaveFollowUps_(); } catch (e) {}

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var crm = listCrm();
  var updates = listFollowUpUpdates(50);
  var latestByRow = {};
  updates.forEach(function (u) {
    var key = String(u.crmRow || '');
    if (key && !latestByRow[key]) latestByRow[key] = u;
  });
  var overdue = [];
  var upcoming = [];
  crm.forEach(function (c) {
    if (!c.followUpDate) return;
    var d = parseDate_(c.followUpDate);
    if (!d) return;
    d.setHours(0, 0, 0, 0);
    var latest = latestByRow[String(c.row)];
    var item = {
      row: c.row,
      companyName: c.companyName,
      primaryContact: c.primaryContact,
      mobile: c.mobile || c.office || '',
      notes: c.notes || '',
      followUpDate: c.followUpDate,
      nextAction: c.nextAction || '',
      owner: c.owner || '',
      quoteRef: c.quoteRef || '',
      source: c.quoteRef ? 'quote' : 'crm',
      overdue: d.getTime() < today.getTime(),
      days: Math.round((d.getTime() - today.getTime()) / 86400000),
      latestUpdate: latest ? latest.update : '',
      latestUpdateAt: latest ? latest.timestamp : '',
      latestUpdateBy: latest ? latest.user : '',
      hasPhone: !!normalizePhone_(c.mobile || c.office || '')
    };
    if (item.overdue) overdue.push(item);
    else if (item.days <= 14) upcoming.push(item);
  });
  overdue.sort(function (a, b) { return a.days - b.days; });
  upcoming.sort(function (a, b) { return a.days - b.days; });
  return {
    overdue: overdue,
    upcoming: upcoming,
    updates: updates,
    companyOptions: crm.map(function (c) {
      return { row: c.row, companyName: c.companyName };
    }).filter(function (c) { return c.companyName; }),
    digest: {
      overdueCount: overdue.length,
      upcomingCount: upcoming.length,
      expiredQuotes: listQuotes().filter(function (q) {
        return String(q.status || '').toLowerCase() === 'expired';
      }).length,
      updateCount: updates.length,
      quoteFollowUps: overdue.concat(upcoming).filter(function (i) { return i.quoteRef; }).length
    }
  };
}

/**
 * Any Finalized/Sent quote without an active CRM follow-up gets one automatically.
 */
function ensureOpenQuotesHaveFollowUps_() {
  var open = listQuotes().filter(function (q) {
    var st = String(q.status || '').toLowerCase();
    return q.reference && (st === 'finalized' || st === 'sent');
  });
  if (!open.length) return;
  var crm = listCrm();
  var byCompany = {};
  crm.forEach(function (c) {
    byCompany[String(c.companyName || '').toLowerCase()] = c;
  });
  open.forEach(function (q) {
    var key = String(q.client || '').toLowerCase();
    if (!key) return;
    var existing = byCompany[key];
    if (existing && existing.followUpDate) {
      // Keep quote ref current if missing
      if (!existing.quoteRef && q.reference && existing.row) {
        getSheet_(CONFIG.SHEETS.CRM).getRange(existing.row, 11).setValue(q.reference);
      }
      return;
    }
    try {
      ensureQuoteFollowUp_(q);
      // refresh map so we don't double-create in same pass
      listCrm().forEach(function (c) {
        byCompany[String(c.companyName || '').toLowerCase()] = c;
      });
    } catch (e) {}
  });
}

function snoozeFollowUp(row, days) {
  var sheet = getSheet_(CONFIG.SHEETS.CRM);
  row = Number(row);
  if (!row || row < 2) throw new Error('Invalid CRM row');
  var d = new Date();
  d.setDate(d.getDate() + (Number(days) || 7));
  sheet.getRange(row, 8).setValue(d);
  logActivity_('snooze_followup', 'crm', String(row), '+' + (days || 7) + 'd');
  var crm = null;
  listCrm().forEach(function (c) { if (c.row === row) crm = c; });
  if (crm) {
    try { syncFollowUpToCalendar_(crm); } catch (e) {}
  }
  return getFollowUps();
}

function clearFollowUp(row) {
  var sheet = getSheet_(CONFIG.SHEETS.CRM);
  row = Number(row);
  if (!row || row < 2) throw new Error('Invalid CRM row');
  var crm = null;
  listCrm().forEach(function (c) { if (c.row === row) crm = c; });
  sheet.getRange(row, 8).setValue('');
  if (crm) {
    try { removeFollowUpFromCalendar_(crm); } catch (e) {}
  }
  logActivity_('clear_followup', 'crm', String(row), 'done');
  return getFollowUps();
}

function expireStaleQuotes_() {
  try {
    var settings = getSettings();
    var days = Number(settings.quoteValidityDays || 14);
    var quotes = listQuotes();
    var sheet = getSheet_(CONFIG.SHEETS.QUOTES);
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    quotes.forEach(function (q) {
      var st = String(q.status || '').toLowerCase();
      if (st !== 'finalized' && st !== 'sent') return;
      if (!q.reference) return;
      var d = parseDate_(q.date);
      if (!d) return;
      var until = new Date(d.getTime() + days * 86400000);
      until.setHours(0, 0, 0, 0);
      if (until.getTime() < now.getTime()) {
        sheet.getRange(q.row, 8).setValue('Expired');
      }
    });
  } catch (e) { /* non-blocking */ }
}

function installDailyMaintenanceTrigger() {
  requireAdmin_('install triggers');
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runDailyMaintenance') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runDailyMaintenance').timeBased().everyDays(1).atHour(7).create();
  return { ok: true, message: 'Daily maintenance trigger installed (07:00)' };
}

function runDailyMaintenance() {
  expireStaleQuotes_();
  var dig = getFollowUps();
  logActivity_(
    'daily_digest',
    'system',
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    'Overdue follow-ups: ' + dig.digest.overdueCount +
      ' · Upcoming: ' + dig.digest.upcomingCount +
      ' · Expired quotes: ' + dig.digest.expiredQuotes
  );
  return dig.digest;
}

/* ========== Client timeline ========== */

function getClientTimeline(companyName) {
  ensureAppSheets_();
  var name = String(companyName || '').trim();
  if (!name) throw new Error('Company name is required');
  var key = name.toLowerCase();
  var events = [];

  function push(when, type, title, detail, ref, meta) {
    events.push({
      when: when || '',
      type: type || '',
      title: title || '',
      detail: detail || '',
      ref: ref || '',
      meta: meta || {}
    });
  }

  function whenMs(v) {
    var d = parseDate_(v);
    return d ? d.getTime() : 0;
  }

  listCrm().forEach(function (c) {
    if (String(c.companyName || '').toLowerCase() !== key) return;
    push(c.followUpDate || '', 'crm', 'CRM contact',
      [c.primaryContact, c.mobile || c.office, c.nextAction ? ('Next: ' + c.nextAction) : '', c.owner ? ('Owner: ' + c.owner) : '']
        .filter(Boolean).join(' · '),
      String(c.row), { row: c.row, nextAction: c.nextAction, owner: c.owner });
    if (c.notes) {
      push(c.followUpDate || new Date(), 'note', 'CRM notes', String(c.notes).slice(0, 400), String(c.row), {});
    }
  });

  listFollowUpUpdates(80).forEach(function (u) {
    if (String(u.company || '').toLowerCase() !== key) return;
    push(u.timestamp, 'update', 'Team update', u.update, '', { user: u.user });
  });

  listQuotes().forEach(function (q) {
    if (String(q.client || '').toLowerCase() !== key) return;
    if (String(q.status || '').toLowerCase() === 'superseded') return;
    push(q.date, 'quote', (q.reference || 'Draft quote') + ' · ' + (q.status || ''),
      (q.description || '') + (q.outcomeReason ? ' · ' + q.outcomeReason : ''),
      q.quoteId || q.reference, { amount: q.amount, status: q.status });
  });

  listInvoices().forEach(function (inv) {
    if (String(inv.client || '').toLowerCase() !== key) return;
    push(inv.date, 'invoice', inv.reference + ' · ' + (inv.paymentStatus || inv.status || ''),
      inv.description || '',
      inv.reference, {
        amount: inv.amount,
        amountPaid: inv.amountPaid,
        balanceDue: inv.balanceDue,
        paymentStatus: inv.paymentStatus
      });
  });

  listPayments().forEach(function (p) {
    if (String(p.client || '').toLowerCase() !== key) return;
    push(p.timestamp, 'payment', 'Payment ' + p.amount + ' on ' + p.invoiceRef,
      [p.method, p.notes].filter(Boolean).join(' · '),
      p.invoiceRef, { amount: p.amount, balanceAfter: p.balanceAfter, user: p.user });
  });

  try {
    var actSheet = getSheet_(CONFIG.SHEETS.ACTIVITY, true, ACTIVITY_HEADERS);
    sheetToObjects_(actSheet).forEach(function (r) {
      var details = String(r.Details || '');
      var reference = String(r.Reference || '');
      var hay = (details + ' ' + reference).toLowerCase();
      if (hay.indexOf(key) < 0 && reference.toLowerCase() !== key) return;
      push(r.Timestamp, 'activity', r.Action || 'Activity', details, reference, { user: r.User || '' });
    });
  } catch (e) {}

  events.sort(function (a, b) { return whenMs(b.when) - whenMs(a.when); });

  var client = findClient_(name);
  var crm = null;
  listCrm().forEach(function (c) {
    if (String(c.companyName || '').toLowerCase() === key) crm = c;
  });

  return {
    companyName: name,
    client: client,
    crm: crm,
    events: events.slice(0, 80),
    totals: {
      quotes: events.filter(function (e) { return e.type === 'quote'; }).length,
      invoices: events.filter(function (e) { return e.type === 'invoice'; }).length,
      payments: events.filter(function (e) { return e.type === 'payment'; }).length,
      updates: events.filter(function (e) { return e.type === 'update'; }).length
    }
  };
}

/* ========== Reports ========== */

function getReports() {
  ensureAppSheets_();
  expireStaleQuotes_();
  var quotes = listQuotes();
  var invoices = listInvoices();
  var income = listIncome_();
  var expenses = listExpenses_();

  var byDivision = {};
  CONFIG.DIVISIONS.forEach(function (d) {
    byDivision[d.code] = {
      code: d.code,
      brand: d.brand,
      quotes: 0,
      awarded: 0,
      notAwarded: 0,
      expired: 0,
      amount: 0,
      awardedAmount: 0
    };
  });

  quotes.forEach(function (q) {
    if (String(q.status || '').toLowerCase() === 'superseded') return;
    var code = q.divisionCode || getDivision_(q.vertical).code;
    if (!byDivision[code]) {
      byDivision[code] = {
        code: code, brand: q.divisionBrand || q.vertical,
        quotes: 0, awarded: 0, notAwarded: 0, expired: 0, amount: 0, awardedAmount: 0
      };
    }
    var st = String(q.status || '').toLowerCase();
    byDivision[code].quotes += 1;
    byDivision[code].amount += toNumber_(q.amount);
    if (st === 'awarded') {
      byDivision[code].awarded += 1;
      byDivision[code].awardedAmount += toNumber_(q.amount);
    } else if (st === 'not awarded') {
      byDivision[code].notAwarded += 1;
    } else if (st === 'expired') {
      byDivision[code].expired += 1;
    }
  });

  var winRate = Object.keys(byDivision).map(function (k) {
    var d = byDivision[k];
    var decided = d.awarded + d.notAwarded;
    d.winRate = decided ? Math.round((d.awarded / decided) * 1000) / 10 : null;
    return d;
  });

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var aging = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0, items: [] };
  invoices.filter(function (inv) {
    return String(inv.paymentStatus || '').toLowerCase() !== 'paid';
  }).forEach(function (inv) {
    var d = parseDate_(inv.date) || today;
    var age = Math.max(0, Math.floor((today.getTime() - d.getTime()) / 86400000));
    var bucket = 'current';
    if (age > 90) bucket = 'over90';
    else if (age > 60) bucket = 'd90';
    else if (age > 30) bucket = 'd60';
    else if (age > 0) bucket = 'd30';
    aging[bucket] += toNumber_(inv.amount);
    aging.items.push({
      reference: inv.reference,
      client: inv.client,
      amount: inv.amount,
      paymentStatus: inv.paymentStatus,
      ageDays: age,
      bucket: bucket
    });
  });
  aging.items.sort(function (a, b) { return b.ageDays - a.ageDays; });

  var months = {};
  function monthKey(dateVal) {
    var d = parseDate_(dateVal);
    if (!d) return null;
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM');
  }
  income.forEach(function (r) {
    var k = monthKey(r.date);
    if (!k) return;
    if (!months[k]) months[k] = { month: k, income: 0, expense: 0, net: 0 };
    months[k].income += toNumber_(r.totalAmount || r.billAmount);
  });
  expenses.forEach(function (r) {
    var k = monthKey(r.date);
    if (!k) return;
    if (!months[k]) months[k] = { month: k, income: 0, expense: 0, net: 0 };
    months[k].expense += toNumber_(r.amount);
  });
  var monthly = Object.keys(months).sort().reverse().slice(0, 12).map(function (k) {
    months[k].net = months[k].income - months[k].expense;
    return months[k];
  });

  return {
    winRate: winRate,
    aging: aging,
    monthly: monthly,
    generatedAt: new Date()
  };
}

function exportReportCsv(kind) {
  var reports = getReports();
  var lines = [];
  if (kind === 'aging') {
    lines.push(['Reference', 'Client', 'Amount', 'Payment Status', 'Age Days', 'Bucket'].join(','));
    (reports.aging.items || []).forEach(function (r) {
      lines.push([
        csv_(r.reference), csv_(r.client), r.amount, csv_(r.paymentStatus), r.ageDays, csv_(r.bucket)
      ].join(','));
    });
  } else if (kind === 'winrate') {
    lines.push(['Division', 'Brand', 'Quotes', 'Awarded', 'Not awarded', 'Expired', 'Win %', 'Awarded Amount'].join(','));
    (reports.winRate || []).forEach(function (r) {
      lines.push([
        csv_(r.code), csv_(r.brand), r.quotes, r.awarded, r.notAwarded, r.expired,
        r.winRate == null ? '' : r.winRate, r.awardedAmount
      ].join(','));
    });
  } else {
    lines.push(['Month', 'Income', 'Expense', 'Net'].join(','));
    (reports.monthly || []).forEach(function (r) {
      lines.push([csv_(r.month), r.income, r.expense, r.net].join(','));
    });
  }
  return lines.join('\n');
}

function csv_(v) {
  var s = String(v == null ? '' : v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/* ========== Portal ========== */

function getPortalInfo() {
  var settings = getSettings();
  var scriptUrl = '';
  try { scriptUrl = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  return {
    portalBaseUrl: settings.portalBaseUrl || CONFIG.PORTAL_DEFAULT,
    scriptUrl: scriptUrl,
    note: 'Point crm.redreach.ae (or your portal URL) as an HTTP redirect to the Apps Script web app URL. Apps Script cannot host a custom domain directly.'
  };
}

function getShareableDocLink(type, reference, lang) {
  var base = ScriptApp.getService().getUrl() || '';
  var q = '?page=doc&type=' + encodeURIComponent(type) +
    '&ref=' + encodeURIComponent(reference) +
    (lang ? '&lang=' + encodeURIComponent(lang) : '');
  return base ? (base + q) : q;
}
