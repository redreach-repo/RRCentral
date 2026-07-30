/**
 * Public API for the webapp (google.script.run)
 * Dashboard/bootstrap/templates live in Features.gs
 */

/* ========== CRM ========== */

function listCrm() {
  ensureCrmSchema_();
  var sheet = getSheet_(CONFIG.SHEETS.CRM, true, CRM_HEADERS);
  return sheetToObjects_(sheet).map(mapCrmRow_);
}

function mapCrmRow_(r) {
  return {
    row: r._row,
    slNo: r['Sl no'],
    companyName: r['Company Name'] || '',
    primaryContact: r['Primary Contact'] || '',
    email: r['Email/Phone'] || '',
    mobile: r['Mobile Number'] || '',
    office: r['Office number'] || '',
    notes: r['Notes/Outcome'] || '',
    followUpDate: r['Follow-up Date'] || '',
    nextAction: r['Next Action'] || '',
    owner: r.Owner || '',
    quoteRef: r['Quote Ref'] || '',
    calendarEventId: r['Calendar Event Id'] || '',
    createdBy: r['Created By'] || '',
    updatedBy: r['Updated By'] || ''
  };
}

function saveCrm(payload) {
  ensureAppSheets_();
  var sheet = getSheet_(CONFIG.SHEETS.CRM, true, CRM_HEADERS);
  var dateVal = parseDate_(payload.followUpDate) || '';
  var existingEventId = '';
  var createdBy = '';
  if (payload.row) {
    try { existingEventId = sheet.getRange(payload.row, 12).getValue() || ''; } catch (e) {}
    try { createdBy = sheet.getRange(payload.row, 13).getValue() || ''; } catch (e2) {}
  }
  var who = currentUserLabel_();
  if (!createdBy) createdBy = who;
  var values = [
    payload.slNo || (payload.row ? sheet.getRange(payload.row, 1).getValue() : nextSerial_(sheet, 1)),
    payload.companyName || '',
    payload.primaryContact || '',
    payload.email || '',
    payload.mobile || '',
    payload.office || '',
    payload.notes || '',
    dateVal,
    payload.nextAction || '',
    payload.owner || '',
    payload.quoteRef != null ? payload.quoteRef : (payload.row ? (sheet.getRange(payload.row, 11).getValue() || '') : ''),
    payload.calendarEventId != null ? payload.calendarEventId : existingEventId,
    createdBy,
    who
  ];
  if (payload.row) {
    setRowValues_(sheet, payload.row, values);
  } else {
    values[0] = nextSerial_(sheet, 1);
    appendRows_(sheet, [values]);
  }
  upsertClientFromCrm_(payload);
  logActivity_('save_crm', 'crm', payload.companyName || '', who);

  var saved = null;
  listCrm().forEach(function (c) {
    if (String(c.companyName || '').toLowerCase() === String(payload.companyName || '').toLowerCase()) saved = c;
    if (payload.row && c.row === Number(payload.row)) saved = c;
  });
  if (saved) {
    try {
      if (saved.followUpDate) {
        var calResult = syncFollowUpToCalendar_(saved);
        return { ok: true, records: listCrm(), calendar: calResult };
      } else if (saved.calendarEventId) {
        removeFollowUpFromCalendar_(saved);
      }
    } catch (err) {
      return {
        ok: true,
        records: listCrm(),
        calendar: {
          ok: false,
          error: String(err.message || err),
          message: 'Contact saved, but Calendar sync failed. Connect Google Calendar in Settings.'
        }
      };
    }
  }
  return { ok: true, records: listCrm() };
}

function deleteCrm(row) {
  if (!row || row < 2) throw new Error('Invalid row');
  getSheet_(CONFIG.SHEETS.CRM).deleteRow(row);
  // Follow-up Updates store sheet row numbers — re-point after delete
  try {
    var upd = getSheet_(CONFIG.SHEETS.FOLLOWUP_UPDATES, true, FOLLOWUP_UPDATE_HEADERS);
    var last = upd.getLastRow();
    if (last >= 2) {
      var vals = upd.getRange(2, 3, last - 1, 1).getValues();
      for (var i = 0; i < vals.length; i++) {
        var r = Number(vals[i][0]);
        if (!r) continue;
        if (r === row) upd.getRange(i + 2, 3).setValue('');
        else if (r > row) upd.getRange(i + 2, 3).setValue(r - 1);
      }
    }
  } catch (e) { /* sheet may not exist yet */ }
  return { ok: true, records: listCrm() };
}

function upsertClientFromCrm_(payload) {
  if (!payload.companyName) return;
  var sheet = getSheet_(CONFIG.SHEETS.CLIENTS, true, CLIENT_HEADERS);
  var rows = sheetToObjects_(sheet);
  var existing = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['Company Name']).toLowerCase() === String(payload.companyName).toLowerCase()) {
      existing = rows[i];
      break;
    }
  }
  if (existing) {
    // Write cell-by-cell — merged cells make setValues(row) fail with row-count mismatches
    var vals = [
      payload.companyName,
      payload.primaryContact || existing['Primary Contact'] || '',
      payload.email || existing.Email || '',
      payload.mobile || existing.Mobile || '',
      payload.office || existing.Office || '',
      existing.Address || '',
      existing.TRN || '',
      payload.notes || existing.Notes || ''
    ];
    for (var c = 0; c < vals.length; c++) {
      sheet.getRange(existing._row, c + 2).setValue(vals[c]);
    }
  } else {
    var id = 'C' + ('000' + (rows.length + 1)).slice(-3);
    appendRows_(sheet, [[
      id,
      payload.companyName,
      payload.primaryContact || '',
      payload.email || '',
      payload.mobile || '',
      payload.office || '',
      '',
      '',
      payload.notes || '',
      new Date()
    ]]);
  }
}

function listClients() {
  ensureAppSheets_();
  var clientSheet = getSheet_(CONFIG.SHEETS.CLIENTS, true, CLIENT_HEADERS);
  var fromClients = sheetToObjects_(clientSheet).map(function (r) {
    return {
      id: r['Client ID'],
      companyName: r['Company Name'] || '',
      primaryContact: r['Primary Contact'] || '',
      email: r.Email || '',
      mobile: r.Mobile || '',
      office: r.Office || '',
      address: r.Address || '',
      trn: r.TRN || '',
      notes: r.Notes || ''
    };
  });
  var fromCrm = [];
  try {
    fromCrm = listCrm().map(function (c) {
      return {
        id: '',
        companyName: c.companyName,
        primaryContact: c.primaryContact,
        email: c.email,
        mobile: c.mobile,
        office: c.office,
        address: '',
        trn: '',
        notes: c.notes
      };
    });
  } catch (e) {
    // CRM sheet optional for quoting
  }
  var map = {};
  fromCrm.concat(fromClients).forEach(function (c) {
    if (!c.companyName) return;
    var key = c.companyName.toLowerCase();
    if (!map[key] || c.id) map[key] = c;
  });
  return Object.keys(map).map(function (k) { return map[k]; })
    .sort(function (a, b) { return a.companyName.localeCompare(b.companyName); });
}

/* ========== Quotes ========== */

function listQuotes() {
  ensureQuoteSchema_();
  var sheet = getSheet_(CONFIG.SHEETS.QUOTES, true, QUOTE_HEADERS);
  return sheetToObjects_(sheet, 1, QUOTE_HEADERS.length).map(mapQuoteRow_).reverse();
}

function mapQuoteRow_(r) {
  var division = getDivision_(r['Division Code'] || r.Vertical);
  return {
    row: r._row,
    slNo: r['Sl no'],
    client: r.Client || '',
    vertical: r.Vertical || division.brand,
    divisionCode: r['Division Code'] || division.code,
    divisionBrand: division.brand,
    divisionName: division.name,
    reference: r['Reference number'] || '',
    baseReference: r['Base Reference'] || parseBaseReference_(r['Reference number']),
    revision: toNumber_(r.Revision),
    quoteId: r['Quote ID'] || '',
    date: r.Date || '',
    description: r.Description || '',
    amount: toNumber_(r.Amount),
    status: r.Status || '',
    paymentTerms: r['Payment Terms'] || '',
    moq: r.MOQ !== '' && r.MOQ != null ? toNumber_(r.MOQ) : '',
    notes: r.Notes || '',
    deliveryTerms: r['Delivery Terms'] || '',
    outcomeReason: r['Outcome Reason'] || '',
    createdBy: r['Created By'] || '',
    updatedBy: r['Updated By'] || '',
    isDraft: !r['Reference number'] || String(r.Status || '').toLowerCase() === 'draft'
  };
}

function findQuoteRow_(quoteIdOrRef) {
  var quotes = listQuotes();
  var key = String(quoteIdOrRef || '').trim();
  for (var i = 0; i < quotes.length; i++) {
    if (quotes[i].quoteId === key || quotes[i].reference === key) return quotes[i];
  }
  return null;
}

function getQuote(quoteIdOrRef) {
  var quote = findQuoteRow_(quoteIdOrRef);
  if (!quote) throw new Error('Quote not found: ' + quoteIdOrRef);
  var itemKey = quote.quoteId || quote.reference;
  var items = getLineItems_('Quote', itemKey);
  if (!items.length && quote.reference && quote.reference !== itemKey) {
    items = getLineItems_('Quote', quote.reference);
  }
  if (!items.length && quote.description) {
    var rate = getSettings().vatRate;
    var sub = quote.amount / (1 + rate);
    items = [{
      description: quote.description,
      qty: 1,
      unitPrice: sub,
      amount: sub,
      vatAmount: quote.amount - sub,
      lineTotal: quote.amount
    }];
  }
  return {
    quote: quote,
    items: items,
    client: findClient_(quote.client),
    summary: summarizeItems_(items, getSettings().vatRate),
    settings: getSettings()
  };
}

function writeQuoteRow_(sheet, rowIndex, values) {
  if (rowIndex && rowIndex > 0 && rowIndex <= sheet.getLastRow()) {
    setRowValues_(sheet, rowIndex, values);
  } else {
    appendRows_(sheet, [values]);
  }
}

function buildQuoteRowValues_(opts) {
  var division = getDivision_(opts.divisionCode || opts.divisionBrand);
  var who = currentUserLabel_();
  return [
    opts.slNo,
    opts.client || '',
    sheetVerticalName_(division),
    opts.reference || '',
    opts.dateVal || new Date(),
    opts.description || '',
    opts.amount || 0,
    opts.status || 'Draft',
    opts.divisionCode || division.code,
    opts.baseReference || '',
    opts.revision || 0,
    opts.quoteId || '',
    opts.paymentTerms || '',
    opts.moq != null && opts.moq !== '' ? opts.moq : '',
    opts.notes || '',
    opts.deliveryTerms || '',
    opts.outcomeReason || '',
    opts.createdBy || who,
    opts.updatedBy != null ? opts.updatedBy : who
  ];
}

/**
 * Save quote as Draft (default) or update existing.
 * Official reference numbers are NOT assigned until finalizeQuote().
 */
function saveQuote(payload) {
  ensureAppSheets_();
  var sheet = getSheet_(CONFIG.SHEETS.QUOTES, true, QUOTE_HEADERS);
  if (!sheet) throw new Error('Could not open Quotation Tracker sheet');
  var division = getDivision_(payload.divisionCode || payload.division || payload.vertical);
  var summary = summarizeItems_(payload.items || [], getSettings().vatRate);
  var description = payload.description ||
    ((payload.items || []).map(function (i) { return i.description; }).filter(Boolean).join('; ')) ||
    '';
  var dateVal = parseDate_(payload.date) || new Date();
  var amount = payload.items && payload.items.length ? summary.total : toNumber_(payload.amount);

  // Block empty spam drafts (client + at least one real line, or a description)
  var meaningfulItems = (payload.items || []).filter(function (i) {
    return String(i.description || '').trim() || toNumber_(i.unitPrice) > 0;
  });
  var hasClient = String(payload.client || '').trim();
  if (!payload.quoteId && !payload.row && !payload.reference) {
    if (!hasClient && !meaningfulItems.length && !String(description || '').trim()) {
      throw new Error('Add a client or line items before saving a draft');
    }
  }

  var existing = null;
  if (payload.quoteId) existing = findQuoteRow_(payload.quoteId);
  else if (payload.row) {
    var all = listQuotes();
    for (var i = 0; i < all.length; i++) {
      if (all[i].row === Number(payload.row)) { existing = all[i]; break; }
    }
  } else if (payload.reference) {
    existing = findQuoteRow_(payload.reference);
  }

  var quoteId = (existing && existing.quoteId) || payload.quoteId || newQuoteId_();
  var isFinalized = existing && existing.reference && String(existing.status).toLowerCase() !== 'draft';
  var reference = isFinalized ? existing.reference : '';
  var baseReference = isFinalized ? (existing.baseReference || parseBaseReference_(existing.reference)) : '';
  var revision = isFinalized ? toNumber_(existing.revision) : 0;
  var status = isFinalized ? (payload.status || existing.status || 'Finalized') : 'Draft';

  // Editing a finalized quote without revise keeps the same reference
  if (isFinalized && payload.status) status = payload.status;

  var slNo;
  var rowIndex;
  if (existing) {
    rowIndex = existing.row;
    slNo = existing.slNo || nextSerial_(sheet, 1);
  } else {
    rowIndex = sheet.getLastRow() + 1;
    slNo = nextSerial_(sheet, 1);
  }

  writeQuoteRow_(sheet, rowIndex, buildQuoteRowValues_({
    slNo: slNo,
    client: payload.client || '',
    divisionBrand: division.brand,
    reference: reference,
    dateVal: dateVal,
    description: description,
    amount: amount,
    status: status,
    divisionCode: division.code,
    baseReference: baseReference,
    revision: revision,
    quoteId: quoteId,
    paymentTerms: payload.paymentTerms || (existing && existing.paymentTerms) || getSettings().defaultPaymentTerms || getSettings().paymentTerms,
    moq: payload.moq != null && payload.moq !== '' ? toNumber_(payload.moq) : ((existing && existing.moq !== '' && existing.moq != null) ? existing.moq : getSettings().moqDefault),
    notes: payload.notes != null ? payload.notes : ((existing && existing.notes) || ''),
    deliveryTerms: payload.deliveryTerms || (existing && existing.deliveryTerms) || getSettings().defaultDeliveryTerms || getSettings().deliveryTerms,
    outcomeReason: payload.outcomeReason != null ? payload.outcomeReason : ((existing && existing.outcomeReason) || ''),
    createdBy: (existing && existing.createdBy) || currentUserLabel_()
  }));

  if (payload.items && payload.items.length) {
    saveLineItems_('Quote', quoteId, payload.items, getSettings().vatRate);
  }

  logActivity_('save_quote', 'quote', quoteId, (payload.client || '') + ' · ' + status);
  return getQuote(quoteId);
}

/**
 * Assigns unique RR-{division}-{YY}{seq} reference. Only then is the quote official.
 */
function finalizeQuote(quoteIdOrRef) {
  ensureAppSheets_();
  var sheet = getSheet_(CONFIG.SHEETS.QUOTES);
  var existing = findQuoteRow_(quoteIdOrRef);
  if (!existing) throw new Error('Quote not found');
  if (existing.reference && String(existing.status).toLowerCase() !== 'draft') {
    return getQuote(existing.quoteId || existing.reference);
  }
  if (!existing.client) throw new Error('Client is required before finalizing');
  if (!existing.divisionCode && !existing.vertical) throw new Error('Division is required before finalizing');

  var division = getDivision_(existing.divisionCode || existing.vertical);
  var baseReference = generateReference_(division.code, 'quote');
  var quoteId = existing.quoteId || newQuoteId_();
  writeQuoteRow_(sheet, existing.row, buildQuoteRowValues_({
    slNo: existing.slNo || nextSerial_(sheet, 1),
    client: existing.client,
    divisionBrand: division.brand,
    reference: baseReference,
    dateVal: parseDate_(existing.date) || new Date(),
    description: existing.description,
    amount: existing.amount,
    status: 'Finalized',
    divisionCode: division.code,
    baseReference: baseReference,
    revision: 0,
    quoteId: quoteId,
    paymentTerms: existing.paymentTerms || getSettings().defaultPaymentTerms || getSettings().paymentTerms,
    moq: existing.moq !== '' && existing.moq != null ? existing.moq : getSettings().moqDefault,
    notes: existing.notes || '',
    deliveryTerms: existing.deliveryTerms || getSettings().defaultDeliveryTerms || getSettings().deliveryTerms,
    outcomeReason: existing.outcomeReason || '',
    createdBy: existing.createdBy || currentUserLabel_()
  }));
  logActivity_('finalize_quote', 'quote', baseReference, existing.client || '');
  var finalized = getQuote(quoteId);
  try {
    ensureQuoteFollowUp_(finalized.quote);
  } catch (e) {
    logActivity_('followup_auto_fail', 'quote', baseReference, String(e.message || e));
  }
  return finalized;
}

/**
 * Reverts a finalized quote back to Draft if no invoice uses the same reference.
 */
function undoFinalizeQuote(quoteIdOrRef) {
  ensureAppSheets_();
  var sheet = getSheet_(CONFIG.SHEETS.QUOTES);
  var existing = findQuoteRow_(quoteIdOrRef);
  if (!existing) throw new Error('Quote not found');
  if (!existing.reference || String(existing.status || '').toLowerCase() === 'draft') {
    throw new Error('Quote is already a draft');
  }
  var st = String(existing.status || '').toLowerCase();
  if (st === 'superseded') throw new Error('Cannot undo a superseded revision');
  if (st === 'awarded') throw new Error('Quote is awarded — undo invoice first or revise instead');

  var invRow = findRowByReference_(getSheet_(CONFIG.SHEETS.INVOICES), 4, existing.reference);
  if (invRow > 0) {
    throw new Error('An invoice already uses ' + existing.reference + '. Delete or change that invoice first.');
  }

  var quoteId = existing.quoteId || newQuoteId_();
  writeQuoteRow_(sheet, existing.row, buildQuoteRowValues_({
    slNo: existing.slNo || nextSerial_(sheet, 1),
    client: existing.client,
    divisionBrand: getDivision_(existing.divisionCode || existing.vertical).brand,
    reference: '',
    dateVal: parseDate_(existing.date) || new Date(),
    description: existing.description,
    amount: existing.amount,
    status: 'Draft',
    divisionCode: existing.divisionCode || getDivision_(existing.vertical).code,
    baseReference: '',
    revision: 0,
    quoteId: quoteId,
    paymentTerms: existing.paymentTerms || '',
    moq: existing.moq !== '' && existing.moq != null ? existing.moq : getSettings().moqDefault,
    notes: existing.notes || '',
    deliveryTerms: existing.deliveryTerms || '',
    outcomeReason: '',
    createdBy: existing.createdBy || currentUserLabel_()
  }));
  logActivity_('undo_finalize', 'quote', quoteId, existing.reference);
  return getQuote(quoteId);
}

/**
 * Mark quote Awarded / Not awarded with optional reason.
 */
function setQuoteOutcome(quoteIdOrRef, status, reason) {
  var sheet = getSheet_(CONFIG.SHEETS.QUOTES);
  var existing = findQuoteRow_(quoteIdOrRef);
  if (!existing) throw new Error('Quote not found');
  if (!existing.reference || String(existing.status || '').toLowerCase() === 'draft') {
    throw new Error('Finalize the quote before setting an outcome');
  }
  var allowed = { awarded: 'Awarded', 'not awarded': 'Not awarded', sent: 'Sent', finalized: 'Finalized', expired: 'Expired' };
  var key = String(status || '').toLowerCase();
  if (!allowed[key]) throw new Error('Invalid outcome status');
  sheet.getRange(existing.row, 8).setValue(allowed[key]);
  // Outcome Reason is column 17; Updated By is column 19
  sheet.getRange(existing.row, 17).setValue(reason || '');
  sheet.getRange(existing.row, 19).setValue(currentUserLabel_());
  logActivity_('quote_outcome', 'quote', existing.reference || existing.quoteId, allowed[key] + (reason ? ': ' + reason : ''));
  return getQuote(existing.quoteId || existing.reference);
}

/**
 * Delete a quotation and its line items.
 * Blocks if an invoice already uses the same reference (unless force=true).
 */
function deleteQuote(quoteIdOrRef, force) {
  ensureAppSheets_();
  var existing = findQuoteRow_(quoteIdOrRef);
  if (!existing) throw new Error('Quote not found');

  if (existing.reference) {
    var invSheet = getSheet_(CONFIG.SHEETS.INVOICES, true, INVOICE_HEADERS);
    var invRow = findRowByReference_(invSheet, 4, existing.reference);
    if (invRow > 0 && !force) {
      throw new Error(
        'Invoice ' + existing.reference + ' exists for this quotation. ' +
        'Delete or change that invoice first, or force-delete from the editor.'
      );
    }
  }

  var keys = [];
  if (existing.quoteId) keys.push(String(existing.quoteId));
  if (existing.reference && keys.indexOf(String(existing.reference)) < 0) {
    keys.push(String(existing.reference));
  }
  keys.forEach(function (key) {
    try { clearLineItems_('Quote', key); } catch (e) {}
    try {
      listAttachments('quote', key).forEach(function (a) {
        try { deleteAttachment(a.id); } catch (e2) {}
      });
    } catch (e3) {}
  });

  var sheet = getSheet_(CONFIG.SHEETS.QUOTES);
  var label = existing.reference || existing.quoteId || String(existing.row);
  sheet.deleteRow(existing.row);
  logActivity_('delete_quote', 'quote', label, existing.client || '');
  return { ok: true, deleted: label };
}

/**
 * Creates a revised quote: {baseReference}_revision N
 * Previous version is marked Superseded.
 */
function reviseQuote(quoteIdOrRef) {
  ensureAppSheets_();
  var sheet = getSheet_(CONFIG.SHEETS.QUOTES);
  var existing = findQuoteRow_(quoteIdOrRef);
  if (!existing) throw new Error('Quote not found');
  if (!existing.reference || String(existing.status).toLowerCase() === 'draft') {
    throw new Error('Finalize the quote before creating a revision');
  }

  var baseReference = existing.baseReference || parseBaseReference_(existing.reference);
  var nextRev = toNumber_(existing.revision) + 1;
  // Find highest revision for this base
  listQuotes().forEach(function (q) {
    var b = q.baseReference || parseBaseReference_(q.reference);
    if (b === baseReference && toNumber_(q.revision) >= nextRev) {
      nextRev = toNumber_(q.revision) + 1;
    }
  });

  var newRef = formatRevisionReference_(baseReference, nextRev);
  var newId = newQuoteId_();
  var division = getDivision_(existing.divisionCode || existing.vertical);
  var data = getQuote(existing.quoteId || existing.reference);

  // Supersede previous
  sheet.getRange(existing.row, 8).setValue('Superseded');

  var rowIndex = sheet.getLastRow() + 1;
  writeQuoteRow_(sheet, rowIndex, buildQuoteRowValues_({
    slNo: nextSerial_(sheet, 1),
    client: existing.client,
    divisionBrand: division.brand,
    reference: newRef,
    dateVal: new Date(),
    description: existing.description,
    amount: existing.amount,
    status: 'Finalized',
    divisionCode: division.code,
    baseReference: baseReference,
    revision: nextRev,
    quoteId: newId,
    paymentTerms: existing.paymentTerms || getSettings().defaultPaymentTerms || getSettings().paymentTerms,
    moq: existing.moq !== '' && existing.moq != null ? existing.moq : getSettings().moqDefault,
    notes: existing.notes || '',
    deliveryTerms: existing.deliveryTerms || getSettings().defaultDeliveryTerms || getSettings().deliveryTerms,
    outcomeReason: '',
    createdBy: currentUserLabel_()
  }));

  if (data.items && data.items.length) {
    saveLineItems_('Quote', newId, data.items.map(function (i) {
      return { description: i.description, qty: i.qty, unitPrice: i.unitPrice, remarks: i.remarks || '' };
    }), getSettings().vatRate);
  }

  var revised = getQuote(newId);
  try { ensureQuoteFollowUp_(revised.quote); } catch (e) {}
  return revised;
}

function updateQuoteStatus(quoteIdOrRef, status) {
  var sheet = getSheet_(CONFIG.SHEETS.QUOTES);
  var existing = findQuoteRow_(quoteIdOrRef);
  if (!existing) throw new Error('Quote not found');
  sheet.getRange(existing.row, 8).setValue(status);
  return getQuote(existing.quoteId || existing.reference);
}

/* ========== Invoices ========== */

function listInvoices() {
  ensureInvoiceSchema_();
  var sheet = getSheet_(CONFIG.SHEETS.INVOICES, true, INVOICE_HEADERS);
  var invoices = sheetToObjects_(sheet, 1, INVOICE_HEADERS.length)
    .filter(function (r) { return r.Client || r['Reference number']; })
    .map(mapInvoiceRow_)
    .reverse();
  var allPayments = listPayments();
  var paidByRef = {};
  allPayments.forEach(function (p) {
    paidByRef[p.invoiceRef] = (paidByRef[p.invoiceRef] || 0) + toNumber_(p.amount);
  });
  invoices.forEach(function (inv) {
    var paid = Math.round((paidByRef[inv.reference] || 0) * 100) / 100;
    var balance = Math.round((inv.amount - paid) * 100) / 100;
    inv.amountPaid = paid;
    inv.balanceDue = Math.max(0, balance);
    if (paid > 0 && balance > 0.009 && String(inv.paymentStatus || '').toLowerCase() !== 'partial') {
      // keep sheet status as source for badge, but expose computed
    }
  });
  return invoices;
}

function mapInvoiceRow_(r) {
  return {
    row: r._row,
    slNo: r['Sl no'],
    client: r.Client || '',
    vertical: r.Vertical || '',
    reference: r['Reference number'] || '',
    date: r.Date || '',
    description: r.Description || '',
    amount: toNumber_(r.Amount),
    status: r.Status || '',
    paymentStatus: r['Payment Status'] || '',
    paymentTerms: r['Payment Terms'] || '',
    moq: r.MOQ !== '' && r.MOQ != null ? toNumber_(r.MOQ) : '',
    notes: r.Notes || '',
    deliveryTerms: r['Delivery Terms'] || '',
    createdBy: r['Created By'] || '',
    updatedBy: r['Updated By'] || ''
  };
}

function getInvoice(reference) {
  var invoices = listInvoices();
  var invoice = null;
  for (var i = 0; i < invoices.length; i++) {
    if (invoices[i].reference === reference) { invoice = invoices[i]; break; }
  }
  if (!invoice) throw new Error('Invoice not found: ' + reference);
  var items = getLineItems_('Invoice', reference);
  if (!items.length && invoice.description) {
    var rate = getSettings().vatRate;
    var sub = invoice.amount / (1 + rate);
    items = [{
      description: invoice.description,
      qty: 1,
      unitPrice: sub,
      amount: sub,
      vatAmount: invoice.amount - sub,
      lineTotal: invoice.amount
    }];
  }
  return {
    invoice: invoice,
    items: items,
    client: findClient_(invoice.client),
    summary: summarizeItems_(items, getSettings().vatRate),
    settings: getSettings(),
    payments: listPayments(reference),
    paymentSummary: getInvoicePaymentSummary_(reference, invoice.amount)
  };
}

function saveInvoice(payload) {
  ensureAppSheets_();
  var sheet = getSheet_(CONFIG.SHEETS.INVOICES, true, INVOICE_HEADERS);
  if (!sheet) throw new Error('Could not open Invoice tracker sheet');
  var division = getDivision_(payload.divisionCode || payload.division || payload.vertical);
  var reference = payload.reference || generateReference_(division.code, 'invoice');
  var summary = summarizeItems_(payload.items || [], getSettings().vatRate);
  var description = payload.description ||
    ((payload.items || []).map(function (i) { return i.description; }).filter(Boolean).join('; ')) ||
    '';
  var dateVal = parseDate_(payload.date) || new Date();
  var amount = payload.items && payload.items.length ? summary.total : toNumber_(payload.amount);
  var status = payload.status || 'Awarded';
  var paymentStatus = payload.paymentStatus || 'Pending';
  if (String(status).toLowerCase() === 'cancelled') {
    paymentStatus = 'Pending';
  }

  var rowIndex = payload.row ? Number(payload.row) : findRowByReference_(sheet, 4, reference);
  var who = currentUserLabel_();
  var createdBy = who;
  if (rowIndex > 0) {
    try {
      var existingCreated = sheet.getRange(rowIndex, 14).getValue();
      if (existingCreated) createdBy = existingCreated;
    } catch (e) {}
  }
  var values = [
    rowIndex > 0 ? (sheet.getRange(rowIndex, 1).getValue() || nextSerial_(sheet, 1)) : nextSerial_(sheet, 1),
    payload.client || '',
    sheetVerticalName_(division),
    reference,
    dateVal,
    description,
    amount,
    status,
    paymentStatus,
    payload.paymentTerms || getSettings().defaultPaymentTerms || getSettings().paymentTerms,
    payload.moq != null && payload.moq !== '' ? toNumber_(payload.moq) : getSettings().moqDefault,
    payload.notes || '',
    payload.deliveryTerms || getSettings().defaultDeliveryTerms || getSettings().deliveryTerms,
    createdBy,
    who
  ];

  if (rowIndex > 0) {
    setRowValues_(sheet, rowIndex, values);
  } else {
    appendRows_(sheet, [values]);
  }

  if (payload.items && payload.items.length) {
    saveLineItems_('Invoice', reference, payload.items, getSettings().vatRate);
  }

  if (String(status).toLowerCase() === 'cancelled') {
    deleteFinanceForInvoiceRef_(reference);
  } else {
    try {
      syncIncomeFromInvoice_(reference);
    } catch (e) {
      // Income sync is best-effort; invoice itself is already saved
    }
  }
  logActivity_('save_invoice', 'invoice', reference, (payload.client || '') + ' · ' + status + ' · ' + who);
  return getInvoice(reference);
}

function convertQuoteToInvoice(quoteIdOrRef, options) {
  options = options || {};
  var data = getQuote(quoteIdOrRef);
  var q = data.quote;
  if (!q.reference || String(q.status).toLowerCase() === 'draft') {
    throw new Error('Finalize the quotation before converting to an invoice');
  }

  var useNewReference = !!options.newReference;
  var depositPercent = Number(options.depositPercent || 0);
  var reference = q.reference;
  if (useNewReference) {
    reference = generateReference_(q.divisionCode || getDivision_(q.vertical).code, 'invoice');
  } else {
    var existingInv = findRowByReference_(getSheet_(CONFIG.SHEETS.INVOICES, true, INVOICE_HEADERS), 4, q.reference);
    if (existingInv > 0 && !options.force) {
      throw new Error('Invoice ' + q.reference + ' already exists. Use a new invoice number or open the existing invoice.');
    }
  }

  var items = data.items.map(function (i) {
    return {
      description: i.description,
      qty: i.qty,
      unitPrice: i.unitPrice,
      remarks: i.remarks || ''
    };
  });

  var notes = q.notes || '';
  if (depositPercent > 0 && depositPercent < 100) {
    var factor = depositPercent / 100;
    items = items.map(function (i) {
      return {
        description: i.description + ' (deposit ' + depositPercent + '%)',
        qty: i.qty,
        unitPrice: Math.round(toNumber_(i.unitPrice) * factor * 100) / 100,
        remarks: i.remarks || ''
      };
    });
    notes = (notes ? notes + '\n' : '') +
      'Deposit invoice: ' + depositPercent + '% of quotation ' + q.reference +
      '. Balance due on delivery / as per payment terms.';
  }

  var invPayload = {
    client: q.client,
    vertical: q.divisionBrand || q.vertical,
    divisionCode: q.divisionCode,
    reference: reference,
    date: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    description: q.description + (depositPercent > 0 && depositPercent < 100 ? ' · Deposit ' + depositPercent + '%' : ''),
    status: 'Awarded',
    paymentStatus: 'Pending',
    paymentTerms: options.paymentTerms || q.paymentTerms || getSettings().defaultPaymentTerms || getSettings().paymentTerms,
    moq: q.moq !== '' && q.moq != null ? q.moq : getSettings().moqDefault,
    notes: notes,
    deliveryTerms: options.deliveryTerms || q.deliveryTerms || getSettings().defaultDeliveryTerms || getSettings().deliveryTerms,
    items: items
  };

  if (!options.skipAward) {
    setQuoteOutcome(q.quoteId || q.reference, 'Awarded', options.outcomeReason || 'Converted to invoice ' + reference);
  }
  var saved = saveInvoice(invPayload);
  logActivity_('convert_quote', 'invoice', reference, q.reference + (depositPercent ? ' deposit ' + depositPercent + '%' : ''));
  return saved;
}

function listPayments(invoiceRef) {
  ensureAppSheets_();
  var sheet = getSheet_(CONFIG.SHEETS.PAYMENTS, true, PAYMENT_HEADERS);
  var rows = sheetToObjects_(sheet).map(function (r) {
    return {
      row: r._row,
      timestamp: r.Timestamp || '',
      invoiceRef: r['Invoice Ref'] || '',
      client: r.Client || '',
      amount: toNumber_(r.Amount),
      method: r.Method || '',
      notes: r.Notes || '',
      user: r.User || '',
      balanceAfter: r['Balance After'] !== '' && r['Balance After'] != null ? toNumber_(r['Balance After']) : null
    };
  }).filter(function (p) { return p.invoiceRef || p.amount; });
  if (invoiceRef) {
    rows = rows.filter(function (p) { return String(p.invoiceRef) === String(invoiceRef); });
  }
  return rows.reverse();
}

function getInvoicePaymentSummary_(reference, invoiceAmount) {
  var payments = listPayments(reference);
  var paid = payments.reduce(function (s, p) { return s + toNumber_(p.amount); }, 0);
  var total = toNumber_(invoiceAmount);
  var balance = Math.round((total - paid) * 100) / 100;
  var status = 'Pending';
  if (paid <= 0) status = 'Pending';
  else if (balance <= 0.009) status = 'Paid';
  else status = 'Partial';
  return {
    paid: Math.round(paid * 100) / 100,
    balance: Math.max(0, balance),
    invoiceAmount: total,
    status: status,
    count: payments.length
  };
}

/**
 * Record a (partial or full) payment against an invoice.
 */
function recordPayment(payload) {
  ensureAppSheets_();
  ensureInvoiceSchema_();
  var reference = payload.reference || payload.invoiceRef;
  if (!reference) throw new Error('Invoice reference is required');
  var amount = toNumber_(payload.amount);
  if (!(amount > 0)) throw new Error('Payment amount must be greater than zero');

  var data = getInvoice(reference);
  var inv = data.invoice;
  if (String(inv.status || '').toLowerCase() === 'cancelled') {
    throw new Error('Cancelled invoices cannot take payments');
  }

  var current = getInvoicePaymentSummary_(reference, inv.amount);
  var newPaid = Math.round((current.paid + amount) * 100) / 100;
  var balanceAfter = Math.round((toNumber_(inv.amount) - newPaid) * 100) / 100;
  if (balanceAfter < 0) balanceAfter = 0;
  var status = balanceAfter <= 0.009 ? 'Paid' : 'Partial';

  var sheet = getSheet_(CONFIG.SHEETS.PAYMENTS, true, PAYMENT_HEADERS);
  appendRows_(sheet, [[
    new Date(),
    reference,
    inv.client || '',
    amount,
    payload.method || payload.paymentMethod || 'Bank Transfer',
    payload.notes || '',
    getCurrentUserEmail_(),
    balanceAfter
  ]]);

  setInvoicePaymentStatus_(reference, status);
  try {
    syncIncomeFromInvoice_(reference, payload.method || payload.paymentMethod || 'Bank Transfer');
  } catch (e) {
    logActivity_('income_sync_fail', 'invoice', reference, String(e.message || e));
  }
  logActivity_('record_payment', 'invoice', reference, amount + ' · ' + status + ' · balance ' + balanceAfter);
  return getInvoice(reference);
}

function setInvoicePaymentStatus_(reference, paymentStatus) {
  var invSheet = getSheet_(CONFIG.SHEETS.INVOICES, true, INVOICE_HEADERS);
  ensureInvoiceSchema_();
  var row = findRowByReference_(invSheet, 4, reference);
  if (row < 0) throw new Error('Invoice not found: ' + reference);
  var payCol = findHeaderColumn_(invSheet, 'Payment Status');
  if (payCol < 0) payCol = 9; // schema default
  invSheet.getRange(row, payCol).setValue(paymentStatus);
}

/**
 * Mark invoice paid (records remaining balance as one payment).
 */
function markInvoicePaid(reference, paymentMethod) {
  var role = getUserRole();
  if (!role.canMarkPaid) throw new Error('Only admins can mark invoices as fully paid');
  ensureAppSheets_();
  var data = getInvoice(reference);
  if (String(data.invoice.status || '').toLowerCase() === 'cancelled') {
    throw new Error('Cancelled invoices cannot be marked paid');
  }
  var summary = getInvoicePaymentSummary_(reference, data.invoice.amount);
  if (summary.balance > 0.009) {
    return recordPayment({
      reference: reference,
      amount: summary.balance,
      method: paymentMethod || 'Bank Transfer',
      notes: 'Marked paid (full remaining balance)'
    });
  }
  setInvoicePaymentStatus_(reference, 'Paid');
  try {
    syncIncomeFromInvoice_(reference, paymentMethod || 'Bank Transfer');
  } catch (e) {}
  return getInvoice(reference);
}

function updateInvoicePayment(reference, paymentStatus, paymentMethod) {
  // Backward-compatible: "Paid" → markInvoicePaid
  if (String(paymentStatus || '').toLowerCase() === 'paid') {
    return markInvoicePaid(reference, paymentMethod);
  }
  setInvoicePaymentStatus_(reference, paymentStatus);
  try {
    syncIncomeFromInvoice_(reference, paymentMethod);
  } catch (e) {}
  return getInvoice(reference);
}

function syncIncomeFromInvoice_(reference, paymentMethod) {
  var data = getInvoice(reference);
  var inv = data.invoice;
  if (String(inv.status || '').toLowerCase() === 'cancelled') {
    deleteFinanceForInvoiceRef_(reference);
    return;
  }
  var incomeSheet = getSheet_(CONFIG.SHEETS.INCOME, true, INCOME_HEADERS);
  if (!incomeSheet) return;
  var last = incomeSheet.getLastRow();
  var rowIndex = -1;
  if (last >= 2) {
    var refs = incomeSheet.getRange(2, 4, last, 4).getValues();
    for (var i = 0; i < refs.length; i++) {
      if (String(refs[i][0]) === String(reference)) {
        rowIndex = i + 2;
        break;
      }
    }
  }
  var summary = data.summary;
  var subtotal = summary.subtotal || (inv.amount / (1 + getSettings().vatRate));
  var vat = summary.vat || (inv.amount - subtotal);
  var values = [
    rowIndex > 0 ? incomeSheet.getRange(rowIndex, 1).getValue() : nextSerial_(incomeSheet, 1),
    inv.client,
    inv.vertical,
    inv.reference,
    parseDate_(inv.date) || new Date(),
    inv.description,
    subtotal,
    vat,
    inv.amount,
    inv.status,
    paymentMethod || '',
    inv.paymentStatus
  ];
  if (rowIndex > 0) {
    setRowValues_(incomeSheet, rowIndex, values);
  } else {
    appendRows_(incomeSheet, [values]);
  }
}

/** Remove income + payment log rows for an invoice reference (React parity). */
function deleteFinanceForInvoiceRef_(reference) {
  var ref = String(reference || '').trim();
  if (!ref) return;

  var incomeSheet = getSheet_(CONFIG.SHEETS.INCOME, true, INCOME_HEADERS);
  if (incomeSheet && incomeSheet.getLastRow() >= 2) {
    var incomeRefs = incomeSheet.getRange(2, 4, incomeSheet.getLastRow(), 4).getValues();
    for (var i = incomeRefs.length - 1; i >= 0; i--) {
      if (String(incomeRefs[i][0]) === ref) {
        incomeSheet.deleteRow(i + 2);
      }
    }
  }

  var paySheet = getSheet_(CONFIG.SHEETS.PAYMENTS, true, PAYMENT_HEADERS);
  if (paySheet && paySheet.getLastRow() >= 2) {
    var payRefs = paySheet.getRange(2, 2, paySheet.getLastRow(), 2).getValues();
    for (var j = payRefs.length - 1; j >= 0; j--) {
      if (String(payRefs[j][0]) === ref) {
        paySheet.deleteRow(j + 2);
      }
    }
  }
}

function deleteInvoice(reference) {
  ensureAppSheets_();
  var ref = String(reference || '').trim();
  if (!ref) throw new Error('Invoice reference is required');
  var invSheet = getSheet_(CONFIG.SHEETS.INVOICES, true, INVOICE_HEADERS);
  var row = findRowByReference_(invSheet, 4, ref);
  if (row < 0) throw new Error('Invoice not found: ' + ref);
  var client = '';
  try { client = String(invSheet.getRange(row, 2).getValue() || ''); } catch (e) {}

  clearLineItems_('Invoice', ref);
  deleteFinanceForInvoiceRef_(ref);
  invSheet.deleteRow(row);
  logActivity_('delete_invoice', 'invoice', ref, client);
  return { ok: true, reference: ref };
}

function findClient_(name) {
  if (!name) return null;
  var clients = listClients();
  var key = String(name).toLowerCase().trim();
  for (var i = 0; i < clients.length; i++) {
    if (String(clients[i].companyName).toLowerCase().trim() === key) return clients[i];
  }
  return { companyName: name };
}

/* ========== Income / Expenses (read) ========== */

function listIncome_() {
  var sheet = getSheet_(CONFIG.SHEETS.INCOME);
  return sheetToObjects_(sheet).map(function (r) {
    return {
      slNo: r['Sl no'],
      client: r['Client/Source'] || '',
      category: r['Category (Service/Product)'] || '',
      reference: r['Reference Number'] || '',
      date: r.Date || '',
      description: r.Description || '',
      billAmount: toNumber_(r['Bill Amount']),
      vat: toNumber_(r.VAT),
      totalAmount: toNumber_(r['Total Amount']),
      status: r.Status || '',
      paymentMethod: r['Payment Method'] || '',
      paymentStatus: r['Payment Status'] || ''
    };
  }).filter(function (r) { return r.client || r.reference; });
}

function listExpenses_() {
  var sheet = getSheet_(CONFIG.SHEETS.EXPENSES);
  return sheetToObjects_(sheet).map(function (r) {
    return {
      date: r.Date || '',
      vendor: r.Vendor || '',
      category: r['Category (Travel/Rent/Ads)'] || '',
      amount: toNumber_(r.Amount),
      paymentMethod: r['Payment Method'] || '',
      references: r.References || '',
      notes: r.Notes || ''
    };
  }).filter(function (r) { return r.vendor || r.amount; });
}

function listIncome() { return listIncome_().reverse(); }
function listExpenses() { return listExpenses_().reverse(); }

function saveExpense(payload) {
  var sheet = getSheet_(CONFIG.SHEETS.EXPENSES);
  sheet.appendRow([
    parseDate_(payload.date) || new Date(),
    payload.vendor || '',
    payload.category || '',
    toNumber_(payload.amount),
    payload.paymentMethod || '',
    payload.references || '',
    payload.notes || ''
  ]);
  return { ok: true, records: listExpenses() };
}
