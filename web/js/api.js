/* global RR_CONFIG */
(function (global) {
  var pending = {};
  var seq = 0;

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
      var timeoutMs = cfg.timeoutMs || 25000;
      var timer = setTimeout(function () {
        cleanup();
        reject(new Error(
          'Timed out talking to Google Apps Script. Open the classic app once to authorize, ' +
          'or check that the web app is deployed as “Anyone” (anonymous).'
        ));
      }, timeoutMs);

      function cleanup() {
        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        try { if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe); } catch (e) {}
        delete pending[reqId];
      }

      function onMessage(ev) {
        var data = ev.data;
        if (!data || data.reqId !== reqId) return;
        var originOk =
          !ev.origin ||
          /script\.google\.com$/.test(ev.origin) ||
          /googleusercontent\.com$/.test(ev.origin) ||
          ev.origin === location.origin;
        if (!originOk) return;
        cleanup();
        if (data.ok === false) reject(new Error(data.error || 'API error'));
        else resolve(data.result);
      }

      pending[reqId] = true;
      window.addEventListener('message', onMessage);

      // Prefer GET in a dedicated iframe (more reliable than form POST for Apps Script)
      var iframe = document.createElement('iframe');
      iframe.title = 'API';
      iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;left:-9999px;top:0';
      var q =
        '?page=api' +
        '&fn=' + encodeURIComponent(fnName) +
        '&args=' + encodeURIComponent(JSON.stringify(args)) +
        '&reqId=' + encodeURIComponent(reqId) +
        '&token=' + encodeURIComponent(cfg.apiToken || '') +
        '&userEmail=' + encodeURIComponent(cfg.userEmail || localStorage.getItem('rr_user_email') || '') +
        '&origin=' + encodeURIComponent(location.origin);
      iframe.src = scriptUrl() + q;
      document.body.appendChild(iframe);
    });
  }

  global.RRApi = {
    call: call,
    scriptUrl: scriptUrl
  };
})(window);
