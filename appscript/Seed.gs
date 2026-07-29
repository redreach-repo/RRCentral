/**
 * One-time repair: set delivery terms on Thalassery Restaurant finalized quote.
 * Triggered via web app ?page=fix&key=rr-fix-20260724 then removed.
 */
/**
 * Fast bulk delete of all draft quotations (no reference / status Draft).
 * Rewrites the sheet instead of deleting row-by-row so hundreds of drafts finish under the web app timeout.
 */
function clearAllDraftQuotes() {
  ensureAppSheets_();
  var sheet = getSheet_(CONFIG.SHEETS.QUOTES, true, QUOTE_HEADERS);
  var all = listQuotes();
  var drafts = [];
  var keep = [];
  all.forEach(function (q) {
    var st = String(q.status || '').toLowerCase();
    var isDraft = q.isDraft || !q.reference || st === 'draft';
    if (isDraft) drafts.push(q);
    else keep.push(q);
  });
  if (!drafts.length) {
    return { ok: true, found: 0, deletedCount: 0, deleted: [], errors: [] };
  }

  var draftKeys = {};
  drafts.forEach(function (q) {
    if (q.quoteId) draftKeys[String(q.quoteId)] = true;
    if (q.reference) draftKeys[String(q.reference)] = true;
  });

  // Strip matching line items in one pass
  try {
    var li = getSheet_(CONFIG.SHEETS.LINE_ITEMS, true, LINE_ITEM_HEADERS);
    var liLast = li.getLastRow();
    if (liLast >= 2) {
      var liVals = li.getRange(2, 1, liLast - 1, 2).getValues();
      var keepLi = [];
      for (var i = 0; i < liVals.length; i++) {
        var docType = String(liVals[i][0] || '');
        var ref = String(liVals[i][1] || '');
        if (docType === 'Quote' && draftKeys[ref]) continue;
        keepLi.push(i + 2);
      }
      if (keepLi.length < liVals.length) {
        var width = Math.max(li.getLastColumn(), LINE_ITEM_HEADERS.length);
        var keptRows = [];
        keepLi.forEach(function (rowNum) {
          keptRows.push(li.getRange(rowNum, 1, 1, width).getValues()[0]);
        });
        if (liLast >= 2) li.getRange(2, 1, liLast - 1, width).clearContent();
        if (keptRows.length) {
          li.getRange(2, 1, keptRows.length, width).setValues(keptRows);
        }
      }
    }
  } catch (e) { /* line items optional */ }

  // Rebuild quotation tracker with only non-drafts (preserve data)
  var width = Math.max(sheet.getLastColumn(), QUOTE_HEADERS.length);
  var last = sheet.getLastRow();
  var keptRows = [];
  keep.sort(function (a, b) { return Number(a.row) - Number(b.row); });
  keep.forEach(function (q) {
    keptRows.push(sheet.getRange(q.row, 1, 1, width).getValues()[0]);
  });
  if (last >= 2) {
    sheet.getRange(2, 1, last - 1, width).clearContent();
  }
  if (keptRows.length) {
    sheet.getRange(2, 1, keptRows.length, width).setValues(keptRows);
  }

  var deleted = drafts.map(function (q) {
    return q.quoteId || q.reference || String(q.row);
  });
  logActivity_('clear_drafts', 'quote', '', 'Deleted ' + deleted.length + ' drafts');
  return {
    ok: true,
    found: drafts.length,
    deletedCount: deleted.length,
    deleted: deleted,
    errors: []
  };
}

function fixThalasseryDelivery() {
  ensureAppSheets_();
  var delivery = '2 weeks once the advance payment is done';
  var quotes = listQuotes();
  var matches = quotes.filter(function (q) {
    return String(q.client || '').toLowerCase().indexOf('thalass') >= 0;
  });
  if (!matches.length) {
    return { ok: false, error: 'No quotation found for Thalassery', scanned: quotes.length };
  }
  var updated = [];
  matches.forEach(function (q) {
    var data = getQuote(q.quoteId || q.reference);
    var saved = saveQuote({
      quoteId: q.quoteId,
      row: q.row,
      client: q.client,
      divisionCode: q.divisionCode || getDivision_(q.vertical).code,
      date: q.date,
      description: q.description,
      status: q.status,
      paymentTerms: q.paymentTerms,
      moq: q.moq,
      notes: q.notes,
      deliveryTerms: delivery,
      items: (data.items || []).map(function (i) {
        return { description: i.description, qty: i.qty, unitPrice: i.unitPrice };
      })
    });
    updated.push({
      reference: saved.quote.reference,
      quoteId: saved.quote.quoteId,
      client: saved.quote.client,
      deliveryTerms: saved.quote.deliveryTerms,
      status: saved.quote.status
    });
  });
  return { ok: true, deliveryTerms: delivery, updated: updated };
}

/**
 * One-time seed: uniform quotation that failed to save from the web app.
 * Run seedPendingUniformQuote() from the Apps Script editor if needed.
 */
function seedPendingUniformQuote() {
  ensureAppSheets_();
  var items = [
    { description: 'Oxford shirt with logo & pants (Gabardine)', qty: 1, unitPrice: 125 },
    { description: 'Oxford shirt with logo & pants (Poly Viscous)', qty: 1, unitPrice: 120 },
    { description: 'Oxford shirt with logo & pants (Twill)', qty: 1, unitPrice: 115 },
    { description: 'Blazer with logo (Gabardine)', qty: 1, unitPrice: 400 },
    { description: 'Blazer with logo (Poly viscous)', qty: 1, unitPrice: 375 },
    { description: 'Blazer with logo (Twill)', qty: 1, unitPrice: 350 },
    { description: 'Chinese collar shirt with logo & pants', qty: 1, unitPrice: 120 },
    { description: 'Chinese collar shirt with logo & pants', qty: 1, unitPrice: 115 },
    { description: 'Chinese collar shirt with logo & pants', qty: 1, unitPrice: 110 },
    { description: 'Dry fit polo tshirt with logo and pants', qty: 1, unitPrice: 115 },
    { description: 'Mesh polo tshirt with logo and pants', qty: 1, unitPrice: 105 },
    { description: 'Half apron with logo', qty: 1, unitPrice: 25 },
    { description: 'Full apron with logo', qty: 1, unitPrice: 30 },
    { description: 'Chef coat with 2 flags and logo and pants', qty: 1, unitPrice: 165 },
    { description: 'Chef coat with 2 flags and logo and pants', qty: 1, unitPrice: 160 },
    { description: 'Chef coat with 2 flags and logo and pants', qty: 1, unitPrice: 155 },
    { description: 'Dry Fit Full sleeve round neck tshirt with logo', qty: 1, unitPrice: 125 }
  ];

  var saved = saveQuote({
    client: 'Ello Pets Hotel & Day Care',
    divisionCode: '01',
    vertical: 'Uniform',
    date: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    description: 'Staff uniforms quotation (catalog options)',
    items: items
  });

  var finalized = finalizeQuote(saved.quote.quoteId);
  return {
    ok: true,
    reference: finalized.quote.reference,
    quoteId: finalized.quote.quoteId,
    amount: finalized.quote.amount,
    client: finalized.quote.client,
    itemCount: items.length,
    note: 'Saved as RR Threads (sheet vertical label: Uniform). Change client in Quotation Tracker if needed.'
  };
}
