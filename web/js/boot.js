/* global RR_CONFIG, RRApi */
(function () {
  var gate = document.getElementById('login-gate');
  var app = document.getElementById('app');
  var select = document.getElementById('login-email');
  var other = document.getElementById('login-email-other');
  var btn = document.getElementById('login-btn');
  var err = document.getElementById('login-err');

  function showErr(msg) {
    err.innerHTML = msg || '';
  }

  function classicLink() {
    var url = (window.RR_CONFIG && RR_CONFIG.scriptUrl) || '';
    return url
      ? ' <a href="' + url + '" target="_blank" rel="noopener">Open classic Google app</a>'
      : '';
  }

  select.addEventListener('change', function () {
    var isOther = select.value === '__other__';
    other.style.display = isOther ? 'block' : 'none';
    if (isOther) other.focus();
  });

  var saved = localStorage.getItem('rr_user_email');
  if (saved) {
    var found = false;
    Array.prototype.forEach.call(select.options, function (opt) {
      if (opt.value === saved) { select.value = saved; found = true; }
    });
    if (!found) {
      select.value = '__other__';
      other.style.display = 'block';
      other.value = saved;
    }
  }

  function emailFromForm() {
    if (select.value === '__other__') return String(other.value || '').trim().toLowerCase();
    return String(select.value || '').trim().toLowerCase();
  }

  function startApp(bootstrap) {
    window.__BOOTSTRAP__ = bootstrap || {};
    window.RR_CONFIG = window.RR_CONFIG || {};
    window.RR_CONFIG.userEmail = localStorage.getItem('rr_user_email') || '';
    gate.classList.add('hidden');
    app.classList.remove('hidden');
    var s = document.createElement('script');
    s.src = 'js/app.js';
    s.onerror = function () {
      gate.classList.remove('hidden');
      showErr('Failed to load app.js.' + classicLink());
    };
    document.body.appendChild(s);
  }

  btn.addEventListener('click', function () {
    showErr('');
    var email = emailFromForm();
    if (!email || email.indexOf('@') < 0) {
      showErr('Enter a valid email.');
      return;
    }
    localStorage.setItem('rr_user_email', email);
    window.RR_CONFIG = window.RR_CONFIG || {};
    window.RR_CONFIG.userEmail = email;
    btn.disabled = true;
    btn.textContent = 'Connecting…';
    RRApi.call('getBootstrap', [])
      .then(function (bootstrap) {
        startApp(bootstrap);
      })
      .catch(function (e) {
        btn.disabled = false;
        btn.textContent = 'Continue';
        showErr(
          ((e && e.message) || 'Could not reach Apps Script.') +
          classicLink()
        );
      });
  });
})();
