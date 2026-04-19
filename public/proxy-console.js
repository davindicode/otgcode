// Injected into proxied pages to forward console output to parent
(function() {
  if (window.parent === window) return;
  var methods = ['log', 'warn', 'error', 'info', 'debug'];
  methods.forEach(function(method) {
    var orig = console[method];
    console[method] = function() {
      var args = Array.from(arguments).map(function(a) {
        try { return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a); }
        catch(e) { return String(a); }
      });
      try {
        window.parent.postMessage({
          type: 'proxy-console',
          method: method,
          args: args,
          timestamp: Date.now()
        }, '*');
      } catch(e) {}
      orig.apply(console, arguments);
    };
  });
  // Also capture uncaught errors
  window.addEventListener('error', function(e) {
    try {
      window.parent.postMessage({
        type: 'proxy-console',
        method: 'error',
        args: [e.message + ' at ' + e.filename + ':' + e.lineno],
        timestamp: Date.now()
      }, '*');
    } catch(ex) {}
  });
})();
