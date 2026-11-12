// lumzel:html-deck#sdk lumzel:html-deck#sdk-ctx lumzel:html-deck#msg-wire
// Deck SDK. Runs inside the sandboxed Deck iframe, which has no Tauri access: every call is one
// postMessage {v:1, id, op, args} to the host bridge and one reply {id, ok, result | error}.
(function (window) {
  'use strict';
  var pending = {};
  var seq = 0;

  window.addEventListener('message', function (event) {
    var reply = event.data;
    if (event.source !== window.parent || !reply || typeof reply.id !== 'string') return;
    var waiting = pending[reply.id];
    if (!waiting) return;
    delete pending[reply.id];
    if (reply.ok) waiting.resolve(reply.result);
    else waiting.reject(new Error(typeof reply.error === 'string' ? reply.error : 'Deck call failed'));
  });

  function call(op, args) {
    return new Promise(function (resolve, reject) {
      var id = 'c' + ++seq;
      pending[id] = { resolve: resolve, reject: reject };
      window.parent.postMessage({ v: 1, id: id, op: op, args: args || {} }, '*');
    });
  }

  function report(message, stack) {
    window.parent.postMessage(
      {
        v: 1,
        id: 'e' + ++seq,
        op: 'deck.error',
        args: { message: String(message), stack: stack ? String(stack) : '' },
      },
      '*',
    );
  }

  window.addEventListener('error', function (event) {
    report(event.message || 'Script error', event.error && event.error.stack);
  });
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    report(reason && reason.message ? reason.message : reason, reason && reason.stack);
  });

  var inflightRuns = {};

  function parseBoolAttr(raw) {
    if (raw === 'true' || raw === '') return true;
    if (raw === 'false') return false;
    return undefined;
  }

  function normalizeRunArgs(request) {
    var req = typeof request === 'string' ? { prompt: request } : request || {};
    var args = {
      prompt: req.prompt ? String(req.prompt) : '',
      skill: req.skill ? String(req.skill) : '',
      actionId: req.actionId ? String(req.actionId) : '',
    };
    if (typeof req.focus === 'boolean') args.focus = req.focus;
    if (typeof req.closeDeck === 'boolean') args.closeDeck = req.closeDeck;
    if (req.dedupe === 'running' || req.dedupe === 'session' || req.dedupe === 'none') {
      args.dedupe = req.dedupe;
    } else if (req.dedupe === false) {
      args.dedupe = 'none';
    }
    if (typeof req.dedupeKey === 'string' && req.dedupeKey) args.dedupeKey = req.dedupeKey;
    return args;
  }

  function runAgent(request) {
    var args = normalizeRunArgs(request);
    if (args.dedupe === 'none') return call('agent.run', args);
    var key = args.dedupeKey
      ? 'key:' + args.dedupeKey
      : (args.actionId || '') + '::' + (args.skill || '') + '::' + args.prompt;
    if (inflightRuns[key]) return inflightRuns[key];
    var promise = call('agent.run', args).then(
      function (result) {
        delete inflightRuns[key];
        return result;
      },
      function (error) {
        delete inflightRuns[key];
        throw error;
      },
    );
    inflightRuns[key] = promise;
    return promise;
  }

  window.deck = {
    context: function () {
      return call('ui.context');
    },
    // Starts or locates a project Session and sends the prompt. By default focuses the Session window and
    // reuses a running Session (`dedupe: 'running'`) instead of spawning duplicates on repeat clicks.
    agent: {
      run: runAgent,
      send: function (prompt, options) {
        var req = {};
        if (options && typeof options === 'object') {
          for (var key in options) {
            if (Object.prototype.hasOwnProperty.call(options, key)) req[key] = options[key];
          }
        }
        req.prompt = typeof prompt === 'string' ? prompt : '';
        return runAgent(req);
      },
      open: function (sessionId, options) {
        var args = { sessionId: sessionId ? String(sessionId) : '' };
        if (options && typeof options.closeDeck === 'boolean') args.closeDeck = options.closeDeck;
        return call('agent.open', args);
      },
    },
    // Read-only index of the open Worktree's docs: { features, docs }. Needs the files permission.
    // A built-in Deck opens a listed path in a frame at worktree/<path>.
    docs: {
      index: function () {
        return call('docs.index');
      },
    },
    // HTTP with no Session. Only http://127.0.0.1 and http://localhost. Needs the fetch permission.
    fetch: function (url, init) {
      init = init || {};
      return call('fetch', { url: url, method: init.method || 'GET', body: init.body || '' });
    },
  };

  // Declarative Deck action buttons: `<button data-deck-prompt="..." data-deck-skill="...">`.
  if (window.document && typeof window.document.addEventListener === 'function') {
    window.document.addEventListener('click', function (event) {
      var target = event && event.target;
      if (!target || typeof target.closest !== 'function') return;
      var el = target.closest('[data-deck-prompt], [data-deck-skill]');
      if (!el) return;
      if (el.disabled || el.getAttribute('aria-disabled') === 'true' || el.getAttribute('data-deck-busy') === 'true') {
        return;
      }
      var req = {
        prompt: el.getAttribute('data-deck-prompt') || '',
        skill: el.getAttribute('data-deck-skill') || '',
        actionId: el.getAttribute('data-deck-action') || '',
      };
      var focus = el.hasAttribute('data-deck-focus') ? parseBoolAttr(el.getAttribute('data-deck-focus')) : undefined;
      if (typeof focus === 'boolean') req.focus = focus;
      var closeDeck = el.hasAttribute('data-deck-close-deck')
        ? parseBoolAttr(el.getAttribute('data-deck-close-deck'))
        : undefined;
      if (typeof closeDeck === 'boolean') req.closeDeck = closeDeck;
      var dedupe = el.getAttribute('data-deck-dedupe');
      if (dedupe === 'running' || dedupe === 'session' || dedupe === 'none') req.dedupe = dedupe;
      var dedupeKey = el.getAttribute('data-deck-dedupe-key');
      if (dedupeKey) req.dedupeKey = dedupeKey;

      el.setAttribute('data-deck-busy', 'true');
      var wasButton = 'disabled' in el;
      if (wasButton) el.disabled = true;
      runAgent(req).then(
        function (result) {
          el.removeAttribute('data-deck-busy');
          if (wasButton) el.disabled = false;
          if (result && result.sessionId) el.setAttribute('data-deck-session-id', result.sessionId);
        },
        function (error) {
          el.removeAttribute('data-deck-busy');
          if (wasButton) el.disabled = false;
          report(error && error.message ? error.message : error, error && error.stack);
        },
      );
    });
  }
})(window);
