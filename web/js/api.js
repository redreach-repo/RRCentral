/* global RR_CONFIG */
(function (global) {
  var pending = {};
  var frameName = 'rr-api-frame';
  var seq = 0;

  function ensureFrame() {
    var existing = document.getElementsByName(frameName)[0];
    if (existing) return existing;
    var iframe = document.createElement('iframe');
    iframe.name = frameName;
    iframe.id = frameName;
    iframe.title = 'API';
    iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;left:-9999px;top:0';
    document.body.appendChild(iframe);
    return iframe;
  }

  function scriptUrl() {
    var cfg = global.RR_CONFIG || {};
    if (!cfg.scriptUrl) throw new Error('Missing RR_CONFIG.scriptUrl in web/config.js');
    return String(cfg.scriptUrl).replace(/\/$/, '');
  }

  function call(fnName, args) {
    args = args || [];
    return new Promise(function (resolve, reject) {
      var cfg = global.RR_CONFIG || {};
      var reqId = 'r' + Date.now() + '_' + (++seq);
      var timer = setTimeout(function () {
        if (!pending[reqId]) return;
        delete pending[reqId];
        reject(new Error('API timeout calling ' + fnName));
      }, cfg.timeoutMs || 120000);

      pending[reqId] = {
        resolve: function (v) { clearTimeout(timer); resolve(v); },
        reject: function (e) { clearTimeout(timer); reject(e); }
      };

      ensureFrame();
      var form = document.createElement('form');
      form.method = 'POST';
      form.action = scriptUrl() + '?page=api';
      form.target = frameName;
      form.style.display = 'none';

      function field(name, value) {
        var input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value == null ? '' : String(value);
        form.appendChild(input);
      }

      field('page', 'api');
      field('fn', fnName);
      field('args', JSON.stringify(args));
      field('reqId', reqId);
      field('token', cfg.apiToken || '');
      field('userEmail', cfg.userEmail || localStorage.getItem('rr_user_email') || '');
      field('origin', location.origin);

      document.body.appendChild(form);
      form.submit();
      setTimeout(function () {
        try { form.remove(); } catch (e) {}
      }, 0);
    });
  }

  window.addEventListener('message', function (ev) {
    var data = ev.data;
    if (!data || !data.reqId || !pending[data.reqId]) return;
    // Accept messages from Google Apps Script origins
    var okOrigin = !ev.origin || /script\.google\.com$/.test(ev.origin) || /googleusercontent\.com$/.test(ev.origin);
    if (!okOrigin && ev.origin !== location.origin) return;
    var p = pending[data.reqId];
    delete pending[data.reqId];
    if (data.ok === false) p.reject(new Error(data.error || 'API error'));
    else p.resolve(data.result);
  });

  global.RRApi = { call: call };
})(window);
