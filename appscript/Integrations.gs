/**
 * WhatsApp helpers + Google Calendar sync for follow-ups
 */

function normalizePhone_(raw, countryCode) {
  var digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  var cc = String(countryCode || getSettings().whatsappCountryCode || '971').replace(/\D/g, '') || '971';
  // Already has country code
  if (digits.indexOf(cc) === 0 && digits.length >= cc.length + 7) return digits;
  // UAE local: 05xxxxxxxx → 9715xxxxxxxx
  if (digits.charAt(0) === '0') digits = digits.slice(1);
  if (digits.length <= 9) return cc + digits;
  return digits;
}

function buildWhatsAppUrl(phone, text) {
  var num = normalizePhone_(phone);
  var msg = String(text || '');
  if (num) {
    return 'https://wa.me/' + num + (msg ? ('?text=' + encodeURIComponent(msg)) : '');
  }
  // No phone — open WhatsApp with message only (user picks the chat)
  return 'https://api.whatsapp.com/send?text=' + encodeURIComponent(msg || 'Hello');
}

function getWhatsAppShare(kind, refOrRow) {
  ensureAppSheets_();
  var settings = getSettings();
  var company = settings.companyName || 'RED REACH';
  kind = String(kind || 'custom').toLowerCase();

  if (kind === 'quote' || kind === 'invoice') {
    var data = kind === 'invoice' ? getInvoice(refOrRow) : getQuote(refOrRow);
    var doc = kind === 'invoice' ? data.invoice : data.quote;
    var client = data.client || findClient_(doc.client) || {};
    var phone = client.mobile || '';
    // Prefer CRM mobile for this company
    listCrm().forEach(function (c) {
      if (String(c.companyName || '').toLowerCase() === String(doc.client || '').toLowerCase()) {
        if (c.mobile) phone = c.mobile;
      }
    });
    var url = getDocumentUrl(kind, doc.reference || doc.quoteId || refOrRow, settings.bilingualDefault || 'en');
    var label = kind === 'invoice' ? 'invoice' : 'quotation';
    var text =
      'Hello' + (client.primaryContact ? (' ' + client.primaryContact) : '') + ',\n\n' +
      'Please find our ' + label + ' *' + (doc.reference || 'draft') + '* from ' + company + '.\n' +
      (doc.description ? (doc.description + '\n') : '') +
      'Amount: ' + (settings.currency || 'AED') + ' ' + Number(doc.amount || 0).toFixed(2) + '\n\n' +
      'View / download:\n' + url + '\n\n' +
      'Thank you,\n' + company;
    return {
      url: buildWhatsAppUrl(phone, text),
      phone: phone,
      text: text,
      hasPhone: !!normalizePhone_(phone)
    };
  }

  if (kind === 'followup' || kind === 'crm') {
    var row = Number(refOrRow);
    var crm = null;
    listCrm().forEach(function (c) {
      if (c.row === row) crm = c;
    });
    if (!crm) throw new Error('CRM contact not found');
    var followText =
      'Hello' + (crm.primaryContact ? (' ' + crm.primaryContact) : '') + ',\n\n' +
      'Following up from ' + company +
      (crm.quoteRef ? (' regarding quotation *' + crm.quoteRef + '*') : '') + '.\n' +
      (crm.nextAction ? ('Next step: ' + crm.nextAction + '\n') : '') +
      '\nPlease let us know a convenient time to connect.\n\nThank you,\n' + company;
    return {
      url: buildWhatsAppUrl(crm.mobile || crm.office || '', followText),
      phone: crm.mobile || crm.office || '',
      text: followText,
      hasPhone: !!normalizePhone_(crm.mobile || crm.office || ''),
      companyName: crm.companyName
    };
  }

  var custom = typeof refOrRow === 'object' ? refOrRow : { text: String(refOrRow || '') };
  return {
    url: buildWhatsAppUrl(custom.phone || '', custom.text || ''),
    phone: custom.phone || '',
    text: custom.text || '',
    hasPhone: !!normalizePhone_(custom.phone || '')
  };
}

/* ========== Quote → Follow-up ========== */

function ensureQuoteFollowUp_(quote, options) {
  options = options || {};
  if (!quote || !quote.client) return null;
  ensureAppSheets_();
  var settings = getSettings();
  var days = Number(options.days != null ? options.days : (settings.followUpDaysAfterQuote || 3));
  if (isNaN(days) || days < 0) days = 3;
  var followDate = new Date();
  followDate.setHours(0, 0, 0, 0);
  followDate.setDate(followDate.getDate() + days);

  var crmList = listCrm();
  var existing = null;
  for (var i = 0; i < crmList.length; i++) {
    if (String(crmList[i].companyName || '').toLowerCase() === String(quote.client).toLowerCase()) {
      existing = crmList[i];
      break;
    }
  }

  var noteLine = 'Auto follow-up for quotation ' + (quote.reference || quote.quoteId) +
    ' (' + (settings.currency || 'AED') + ' ' + Number(quote.amount || 0).toFixed(2) + ')';
  var payload = {
    row: existing ? existing.row : undefined,
    slNo: existing ? existing.slNo : undefined,
    companyName: quote.client,
    primaryContact: (existing && existing.primaryContact) || '',
    email: (existing && existing.email) || '',
    mobile: (existing && existing.mobile) || '',
    office: (existing && existing.office) || '',
    notes: existing && existing.notes
      ? (noteLine + '\n' + existing.notes)
      : noteLine,
    followUpDate: Utilities.formatDate(followDate, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    nextAction: 'Follow up on quote',
    owner: (existing && existing.owner) || currentUserLabel_() || getCurrentUserEmail_() || '',
    quoteRef: quote.reference || quote.quoteId || '',
    calendarEventId: existing ? existing.calendarEventId : ''
  };

  // Prefer storing the signed-in user's email as owner so Calendar invite resolves
  if (!existing || !existing.owner) {
    var me = getCurrentUserEmail_();
    if (me) payload.owner = me;
  }

  // Prefer client phone from Clients sheet if CRM blank
  if (!payload.mobile) {
    var client = findClient_(quote.client);
    if (client) {
      payload.mobile = client.mobile || '';
      payload.primaryContact = payload.primaryContact || client.primaryContact || '';
      payload.email = payload.email || client.email || '';
    }
  }

  saveCrm(payload);
  // Re-read to sync calendar with fresh row
  var refreshed = null;
  listCrm().forEach(function (c) {
    if (String(c.companyName || '').toLowerCase() === String(quote.client).toLowerCase()) refreshed = c;
  });
  if (refreshed) {
    try { syncFollowUpToCalendar_(refreshed); } catch (e) { /* calendar optional until authorized */ }
  }
  return refreshed;
}

/* ========== Google Calendar ========== */

function isCalendarSyncEnabled_() {
  var settings = getSettings();
  var v = String(settings.calendarSync == null ? 'yes' : settings.calendarSync).toLowerCase();
  return v !== 'no' && v !== 'false' && v !== '0';
}

function getAppCalendar_() {
  var settings = getSettings();
  var id = String(settings.calendarId || 'primary').trim();
  if (!id || id === 'primary') return CalendarApp.getDefaultCalendar();
  try {
    return CalendarApp.getCalendarById(id) || CalendarApp.getDefaultCalendar();
  } catch (e) {
    return CalendarApp.getDefaultCalendar();
  }
}

/**
 * Map CRM Owner field (name or email) → Google account email(s).
 */
function resolveOwnerEmail_(ownerLabel) {
  var label = String(ownerLabel || '').trim();
  if (!label) return '';
  var lower = label.toLowerCase();
  if (lower.indexOf('@') >= 0) return lower;
  var users = listUsers();
  for (var i = 0; i < users.length; i++) {
    if (!users[i].active) continue;
    var email = String(users[i].email || '').toLowerCase();
    var name = String(users[i].name || '').trim().toLowerCase();
    if (email === lower) return email;
    if (name && name === lower) return email;
    if (email.split('@')[0] === lower) return email;
  }
  return '';
}

function resolveOwnerEmails_(ownerField) {
  var emails = [];
  String(ownerField || '').split(/[,;]/).forEach(function (part) {
    var email = resolveOwnerEmail_(part.trim());
    if (email && emails.indexOf(email) < 0) emails.push(email);
  });
  return emails;
}

function followUpEventTimes_(dateVal) {
  var d = parseDate_(dateVal);
  if (!d) return null;
  var start = new Date(d.getTime());
  start.setHours(9, 0, 0, 0);
  var end = new Date(start.getTime() + 30 * 60 * 1000);
  return { start: start, end: end };
}

function applyFollowUpReminders_(event) {
  if (!event) return;
  try { event.removeAllReminders(); } catch (e) {}
  try { event.addEmailReminder(24 * 60); } catch (e2) {} // 1 day before
  try { event.addPopupReminder(30); } catch (e3) {} // 30 min before
}

function syncEventGuests_(event, guestEmails) {
  if (!event) return;
  var wanted = {};
  (guestEmails || []).forEach(function (e) { wanted[String(e).toLowerCase()] = true; });
  var existing = [];
  try {
    event.getGuestList(false).forEach(function (g) {
      existing.push(String(g.getEmail() || '').toLowerCase());
    });
  } catch (e) {}

  // Add missing guests
  (guestEmails || []).forEach(function (email) {
    var key = String(email).toLowerCase();
    if (existing.indexOf(key) < 0) {
      try { event.addGuest(email); } catch (err) {}
    }
  });

  // Remove guests no longer tagged as owner (keep organizer)
  existing.forEach(function (email) {
    if (!wanted[email]) {
      try { event.removeGuest(email); } catch (err2) {}
    }
  });
}

/**
 * Create/update a calendar event and invite the tagged Owner so it appears
 * on their personal Google Calendar with email/popup reminders.
 */
function syncFollowUpToCalendar_(crm) {
  if (!isCalendarSyncEnabled_()) return { skipped: true, reason: 'disabled' };
  if (!crm || !crm.followUpDate) return { skipped: true, reason: 'no date' };
  var times = followUpEventTimes_(crm.followUpDate);
  if (!times) return { skipped: true, reason: 'bad date' };

  var guests = resolveOwnerEmails_(crm.owner);
  var title = 'Follow up: ' + (crm.companyName || 'Client');
  if (crm.nextAction) title += ' · ' + crm.nextAction;
  var desc = [
    'RED REACH Central follow-up',
    crm.primaryContact ? ('Contact: ' + crm.primaryContact) : '',
    crm.mobile ? ('Mobile: ' + crm.mobile) : '',
    crm.owner ? ('Owner: ' + crm.owner) : '',
    guests.length ? ('Invited: ' + guests.join(', ')) : 'No owner tagged — only on the shared team calendar.',
    crm.quoteRef ? ('Quote: ' + crm.quoteRef) : '',
    crm.notes ? ('Notes:\n' + String(crm.notes).slice(0, 800)) : '',
    '',
    'Open RED REACH Central to update this follow-up.'
  ].filter(function (line, idx, arr) {
    return line !== '' || (idx > 0 && arr[idx - 1] !== '');
  }).join('\n');

  var cal = getAppCalendar_();
  var event = null;
  if (crm.calendarEventId) {
    try {
      event = cal.getEventById(crm.calendarEventId);
    } catch (e) { event = null; }
  }

  if (event) {
    event.setTitle(title);
    event.setDescription(desc);
    try {
      event.setTime(times.start, times.end);
    } catch (e2) {
      try { event.setAllDayDate(times.start); } catch (e3) {}
    }
    syncEventGuests_(event, guests);
  } else {
    var options = {
      description: desc,
      sendInvites: guests.length > 0
    };
    if (guests.length) options.guests = guests.join(',');
    event = cal.createEvent(title, times.start, times.end, options);
  }

  applyFollowUpReminders_(event);

  var eventId = event.getId();
  if (crm.row && eventId) {
    var sheet = getSheet_(CONFIG.SHEETS.CRM);
    // Calendar Event Id is column 12 after Quote Ref (11)
    sheet.getRange(crm.row, 12).setValue(eventId);
  }

  return {
    ok: true,
    eventId: eventId,
    title: title,
    guests: guests,
    invited: guests.length,
    warning: guests.length ? '' : 'No Owner email found — tag an App User as Owner so the invite reaches their Google Calendar.'
  };
}

function removeFollowUpFromCalendar_(crm) {
  if (!crm || !crm.calendarEventId) return { skipped: true };
  try {
    var cal = getAppCalendar_();
    var event = cal.getEventById(crm.calendarEventId);
    if (event) event.deleteEvent();
  } catch (e) { /* ignore */ }
  if (crm.row) {
    try { getSheet_(CONFIG.SHEETS.CRM).getRange(crm.row, 12).setValue(''); } catch (e2) {}
  }
  return { ok: true };
}

function syncFollowUpToCalendar(crmRow) {
  var row = Number(crmRow);
  var crm = null;
  listCrm().forEach(function (c) { if (c.row === row) crm = c; });
  if (!crm) throw new Error('CRM row not found');
  return syncFollowUpToCalendar_(crm);
}

/**
 * Must be run once by the app deployer (script owner) to grant Calendar permission.
 * Prefer the dedicated ?page=calendar-connect URL for a real Google Allow screen.
 */
function authorizeGoogleCalendar() {
  var account = getAppOwnerEmail_() || '';
  try {
    var authInfo = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
    if (authInfo.getAuthorizationStatus() === ScriptApp.AuthorizationStatus.REQUIRED) {
      return {
        ok: false,
        needsAuth: true,
        authUrl: authInfo.getAuthorizationUrl(),
        connectUrl: getCalendarConnectUrl_(),
        account: account,
        message: 'Google needs you to Allow Calendar access. Open the connect link while signed in as ' +
          (account || 'the app owner Gmail') + '.'
      };
    }
  } catch (e) { /* continue and try CalendarApp */ }

  try {
    var cal = getAppCalendar_();
    var name = cal.getName();
    var probe = cal.createEvent(
      'RED REACH Central — calendar connected',
      new Date(Date.now() + 86400000),
      new Date(Date.now() + 86400000 + 30 * 60000),
      { description: 'You can delete this test event. Calendar sync is authorized.' }
    );
    try { probe.deleteEvent(); } catch (e2) {}
    try {
      var settings = getSettings();
      // Persist via save path without requireAdmin when possible
      var sheet = getSheet_(CONFIG.SHEETS.SETTINGS, true, ['Key', 'Value']);
      var map = readKeyValues_(sheet);
      map.calendarAuthorized = 'yes';
      map.calendarAuthorizedAt = new Date().toISOString();
      map.calendarAuthorizedAccount = account;
      var rows = Object.keys(map).map(function (k) { return [k, map[k]]; });
      var output = [['Key', 'Value']].concat(rows);
      sheet.clearContents();
      sheet.getRange(1, 1, output.length, 2).setValues(output);
      sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
    } catch (e3) {}
    logActivity_('authorize_calendar', 'system', '', account || name);
    return {
      ok: true,
      calendarName: name,
      calendarId: cal.getId(),
      account: account,
      connectUrl: getCalendarConnectUrl_(),
      message: 'Google Calendar connected as ' + (account || name) +
        '. Follow-up owners will receive calendar invites on their own Google accounts.'
    };
  } catch (err) {
    var authUrl = '';
    try {
      authUrl = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL).getAuthorizationUrl() || '';
    } catch (e4) {}
    return {
      ok: false,
      needsAuth: true,
      authUrl: authUrl,
      connectUrl: getCalendarConnectUrl_(),
      account: account,
      error: String(err.message || err),
      message: 'Could not access Calendar (' + String(err.message || err) + '). Open the connect link and click Allow.'
    };
  }
}

function getCalendarConnectUrl_() {
  try {
    var base = ScriptApp.getService().getUrl() || '';
    if (!base) return '';
    return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'page=calendar-connect';
  } catch (e) {
    return '';
  }
}

function getCalendarStatus() {
  var enabled = isCalendarSyncEnabled_();
  var account = getAppOwnerEmail_();
  var connectUrl = getCalendarConnectUrl_();
  var settings = {};
  try { settings = getSettings(); } catch (e) {}

  if (String(settings.calendarAuthorized || '').toLowerCase() === 'yes') {
    // Still verify live access — flag can be stale
  }

  try {
    var authInfo = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
    var status = authInfo.getAuthorizationStatus();
    if (status === ScriptApp.AuthorizationStatus.REQUIRED) {
      return {
        ok: false,
        enabled: enabled,
        account: account,
        needsAuth: true,
        authUrl: authInfo.getAuthorizationUrl(),
        connectUrl: connectUrl,
        message: 'Calendar permission not granted. Open Connect link while signed into ' +
          (account || 'alfredsv@gmail.com / redreachdxb@gmail.com') + ' and click Allow.'
      };
    }
  } catch (authErr) { /* fall through */ }

  try {
    var cal = getAppCalendar_();
    return {
      ok: true,
      enabled: enabled,
      calendarName: cal.getName(),
      calendarId: cal.getId(),
      account: account || settings.calendarAuthorizedAccount || '',
      connectUrl: connectUrl,
      message: enabled
        ? ('Connected as ' + (account || cal.getName()) + '. Tag an Owner on each follow-up to invite their Google Calendar.')
        : 'Calendar sync is turned off in Settings.'
    };
  } catch (err) {
    return {
      ok: false,
      enabled: enabled,
      account: account,
      connectUrl: connectUrl,
      error: String(err.message || err),
      needsAuth: true,
      message: 'Calendar not connected (' + String(err.message || err) + '). Use Connect Google Calendar.'
    };
  }
}

function syncAllFollowUpsToCalendar() {
  requireAdmin_('sync calendar');
  // Ensure auth is present before bulk sync
  var status = getCalendarStatus();
  if (!status.ok) {
    throw new Error(status.message || 'Authorize Google Calendar first');
  }
  var result = {
    synced: 0,
    skipped: 0,
    invited: 0,
    errors: [],
    warnings: []
  };
  listCrm().forEach(function (c) {
    if (!c.followUpDate) { result.skipped += 1; return; }
    try {
      var r = syncFollowUpToCalendar_(c);
      if (r && r.ok) {
        result.synced += 1;
        result.invited += Number(r.invited || 0);
        if (r.warning) result.warnings.push((c.companyName || c.row) + ': ' + r.warning);
      } else {
        result.skipped += 1;
      }
    } catch (e) {
      result.errors.push((c.companyName || c.row) + ': ' + (e.message || e));
    }
  });
  logActivity_('sync_calendar', 'system', '', 'Synced ' + result.synced + ', invited ' + result.invited);
  return result;
}
