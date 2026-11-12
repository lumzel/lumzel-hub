// lumzel:html-deck#sdk lumzel:html-deck#sdk-ctx lumzel:html-deck#msg-wire
// Deck 2.0 SDK. Runs inside the sandboxed Deck iframe, which has no Tauri access: every call is one
// postMessage {v:1, id, op, args} to the host bridge and one reply {id, ok, result | error}, plus
// host push events {event: 'agent.state' | 'agent.event', ...}.
(function (window) {
  'use strict';
  var pending = {};
  var seq = 0;
  var inflightRuns = {};
  var tokenButtons = {};
  var stateListeners = [];
  var eventSubscribers = {};
  var UPLOAD_CHUNK_BYTES = 512 * 1024;

  function emitDomEvent(el, name, detail) {
    if (!el || typeof el.dispatchEvent !== 'function' || typeof window.CustomEvent !== 'function') return;
    try {
      el.dispatchEvent(new window.CustomEvent(name, { bubbles: true, detail: detail }));
    } catch (_err) {
      // Ignore synthetic event errors in minimal/headless DOM hosts.
    }
  }

  function handlePushEvent(msg) {
    if (msg.event === 'agent.state') {
      if (msg.runToken && tokenButtons[msg.runToken]) {
        var btn = tokenButtons[msg.runToken];
        if (msg.sessionId) btn.setAttribute('data-deck-session-id', String(msg.sessionId));
        if (msg.state) btn.setAttribute('data-deck-state', String(msg.state));
        emitDomEvent(btn, 'deck:state', msg);
      }
      for (var i = 0; i < stateListeners.length; i++) {
        try {
          stateListeners[i](msg);
        } catch (err) {
          report(err && err.message ? err.message : err, err && err.stack);
        }
      }
      return;
    }
    if (msg.event === 'agent.event') {
      var sid = msg.sessionId ? String(msg.sessionId) : '';
      var targets = [];
      if (sid && eventSubscribers[sid]) targets = targets.concat(eventSubscribers[sid]);
      if (eventSubscribers['*']) targets = targets.concat(eventSubscribers['*']);
      for (var j = 0; j < targets.length; j++) {
        try {
          targets[j](msg);
        } catch (err2) {
          report(err2 && err2.message ? err2.message : err2, err2 && err2.stack);
        }
      }
    }
  }

  window.addEventListener('message', function (event) {
    var reply = event.data;
    if (event.source !== window.parent || !reply || typeof reply !== 'object') return;
    if (typeof reply.event === 'string') {
      handlePushEvent(reply);
      return;
    }
    if (typeof reply.id !== 'string') return;
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

  function parseBoolAttr(raw) {
    if (raw === 'true' || raw === '') return true;
    if (raw === 'false') return false;
    return undefined;
  }

  function isPermissionTier(raw) {
    return raw === 'ask' || raw === 'auto-edit' || raw === 'auto' || raw === 'bypass';
  }

  function normalizeRunArgs(request) {
    var req = typeof request === 'string' ? { prompt: request } : request || {};
    var args = {
      prompt: req.prompt ? String(req.prompt) : '',
      skill: req.skill ? String(req.skill) : '',
      actionId: req.actionId ? String(req.actionId) : '',
    };
    if (typeof req.sessionId === 'string' && req.sessionId.trim()) args.sessionId = req.sessionId.trim();
    if (typeof req.focus === 'boolean') args.focus = req.focus;
    if (typeof req.closeDeck === 'boolean') args.closeDeck = req.closeDeck;
    if (typeof req.wait === 'boolean') args.wait = req.wait;
    if (req.dedupe === 'running' || req.dedupe === 'session' || req.dedupe === 'none') {
      args.dedupe = req.dedupe;
    } else if (req.dedupe === false) {
      args.dedupe = 'none';
    }
    if (typeof req.dedupeKey === 'string' && req.dedupeKey) args.dedupeKey = req.dedupeKey;
    if (typeof req.provider === 'string' && req.provider.trim()) args.provider = req.provider.trim();
    if (typeof req.model === 'string' && req.model.trim()) args.model = req.model.trim();
    if (typeof req.effort === 'string' && req.effort.trim()) args.effort = req.effort.trim();
    if (isPermissionTier(req.permissions)) args.permissions = req.permissions;
    if (typeof req.loadout === 'string' && req.loadout.trim()) args.loadout = req.loadout.trim();
    if (typeof req.plan === 'boolean') args.plan = req.plan;
    if (typeof req.runToken === 'string' && req.runToken) args.runToken = req.runToken;
    return args;
  }

  function runAgent(request) {
    var args = normalizeRunArgs(request);
    if (args.dedupe === 'none') return call('agent.run', args);
    var prefix = args.sessionId ? 'sid:' + args.sessionId + '::' : '';
    var key = args.dedupeKey
      ? 'key:' + args.dedupeKey
      : prefix + (args.actionId || '') + '::' + (args.skill || '') + '::' + args.prompt;
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

  function bytesToBase64(bytes) {
    var binary = '';
    var step = 0x8000;
    for (var i = 0; i < bytes.length; i += step) {
      var slice = bytes.subarray(i, Math.min(i + step, bytes.length));
      binary += String.fromCharCode.apply(null, slice);
    }
    if (typeof window.btoa === 'function') return window.btoa(binary);
    if (typeof btoa === 'function') return btoa(binary);
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    throw new Error('No base64 encoder available');
  }

  function toUint8Array(source) {
    if (!source) return Promise.resolve(new Uint8Array(0));
    if (source instanceof Uint8Array) return Promise.resolve(source);
    if (typeof ArrayBuffer !== 'undefined' && source instanceof ArrayBuffer) {
      return Promise.resolve(new Uint8Array(source));
    }
    if (typeof source.arrayBuffer === 'function') {
      return source.arrayBuffer().then(function (buf) {
        return new Uint8Array(buf);
      });
    }
    return Promise.resolve(null);
  }

  function uploadFile(path, source, options) {
    var opts = options || {};
    var targetPath = path ? String(path) : '';
    var overwrite = opts.overwrite !== false;
    if (typeof source === 'string') {
      return call('files.upload', {
        path: targetPath,
        dataBase64: source,
        append: Boolean(opts.append),
        overwrite: overwrite,
      });
    }
    return toUint8Array(source).then(function (bytes) {
      if (!bytes) throw new Error('files.upload expects a File, Blob, Uint8Array, ArrayBuffer, or base64 string');
      if (bytes.length === 0) {
        return call('files.upload', {
          path: targetPath,
          dataBase64: '',
          append: false,
          overwrite: overwrite,
        });
      }
      var total = bytes.length;
      var offset = 0;
      var chunkIndex = 0;
      var lastResult = null;
      function nextChunk() {
        if (offset >= total) return Promise.resolve(lastResult);
        var end = Math.min(offset + UPLOAD_CHUNK_BYTES, total);
        var slice = bytes.subarray(offset, end);
        var b64 = bytesToBase64(slice);
        var req = {
          path: targetPath,
          dataBase64: b64,
          append: chunkIndex > 0,
          overwrite: chunkIndex === 0 ? overwrite : true,
        };
        offset = end;
        chunkIndex += 1;
        return call('files.upload', req).then(function (res) {
          lastResult = res;
          if (typeof opts.onProgress === 'function') {
            opts.onProgress({ loaded: offset, total: total });
          }
          return nextChunk();
        });
      }
      return nextChunk();
    });
  }

  function subscribeAgentEvents(sessionIdOrCb, maybeCb) {
    var sid = typeof sessionIdOrCb === 'function' ? '*' : String(sessionIdOrCb || '*');
    var cb = typeof sessionIdOrCb === 'function' ? sessionIdOrCb : maybeCb;
    if (typeof cb !== 'function') throw new Error('agent.onEvent expects a callback');
    var list = eventSubscribers[sid];
    if (!list) {
      list = [];
      eventSubscribers[sid] = list;
      call('agent.subscribe', { sessionId: sid }).catch(function () {});
    }
    list.push(cb);
    var active = true;
    return function unsubscribe() {
      if (!active) return;
      active = false;
      var current = eventSubscribers[sid];
      if (!current) return;
      var idx = current.indexOf(cb);
      if (idx >= 0) current.splice(idx, 1);
      if (current.length === 0) {
        delete eventSubscribers[sid];
        call('agent.unsubscribe', { sessionId: sid }).catch(function () {});
      }
    };
  }

  function subscribeAgentState(cb) {
    if (typeof cb !== 'function') throw new Error('agent.onState expects a callback');
    stateListeners.push(cb);
    return function unsubscribe() {
      var idx = stateListeners.indexOf(cb);
      if (idx >= 0) stateListeners.splice(idx, 1);
    };
  }

  window.deck = {
    context: function () {
      return call('ui.context');
    },
    // Agent execution, logs, live events, stop, and Session context/draft composition.
    // Defaults: `focus: false` (runs in background, visible in Session list), `wait: true` (returns Turn output),
    // `dedupe: 'running'` (prevents duplicate concurrent execution).
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
      stop: function (sessionId) {
        return call('agent.stop', { sessionId: sessionId ? String(sessionId) : '' });
      },
      compose: function (request) {
        var req = typeof request === 'string' ? { draft: request } : request || {};
        return call('agent.compose', req);
      },
      logs: function (sessionId, options) {
        var args = { sessionId: sessionId ? String(sessionId) : '' };
        if (options && typeof options.afterSeq === 'number') args.afterSeq = options.afterSeq;
        return call('agent.logs', args);
      },
      onEvent: subscribeAgentEvents,
      onState: subscribeAgentState,
    },
    // Local SQLite database (`deck.json` `permissions: ["db"]`).
    db: {
      query: function (sql, params) {
        var args = { sql: sql ? String(sql) : '' };
        if (Array.isArray(params)) args.params = params;
        return call('db.query', args);
      },
      exec: function (sql, params) {
        var args = { sql: sql ? String(sql) : '' };
        if (Array.isArray(params)) args.params = params;
        return call('db.exec', args);
      },
    },
    // Zero-SQL JSON KV document store backed by the Deck's SQLite DB (`permissions: ["db"]`).
    store: {
      get: function (collectionOrKey, keyOrOptions) {
        var args =
          typeof keyOrOptions === 'string'
            ? { collection: String(collectionOrKey || ''), key: keyOrOptions }
            : {
                key: String(collectionOrKey || ''),
                collection: keyOrOptions && keyOrOptions.collection ? String(keyOrOptions.collection) : undefined,
              };
        return call('store.get', args).then(function (res) {
          return res && res.entry ? res.entry.value : null;
        });
      },
      getEntry: function (collectionOrKey, keyOrOptions) {
        var args =
          typeof keyOrOptions === 'string'
            ? { collection: String(collectionOrKey || ''), key: keyOrOptions }
            : {
                key: String(collectionOrKey || ''),
                collection: keyOrOptions && keyOrOptions.collection ? String(keyOrOptions.collection) : undefined,
              };
        return call('store.get', args).then(function (res) {
          return res && res.entry ? res.entry : null;
        });
      },
      put: function (a, b, c) {
        var hasCollectionArg = arguments.length >= 3 && typeof a === 'string' && typeof b === 'string';
        var args = hasCollectionArg
          ? { collection: a, key: b, value: c }
          : {
              key: String(a || ''),
              value: b,
              collection: c && c.collection ? String(c.collection) : undefined,
            };
        return call('store.put', args);
      },
      list: function (options) {
        var opts = typeof options === 'string' ? { collection: options } : options || {};
        return call('store.list', opts).then(function (res) {
          return res && Array.isArray(res.entries) ? res.entries : [];
        });
      },
      delete: function (collectionOrKey, keyOrOptions) {
        var args =
          typeof keyOrOptions === 'string'
            ? { collection: String(collectionOrKey || ''), key: keyOrOptions }
            : {
                key: String(collectionOrKey || ''),
                collection: keyOrOptions && keyOrOptions.collection ? String(keyOrOptions.collection) : undefined,
              };
        return call('store.delete', args);
      },
    },
    // Scoped Worktree file access (`permissions: ["files"]`) and file upload/picker (`permissions: ["upload"]`).
    files: {
      list: function (dir) {
        var args = typeof dir === 'string' && dir ? { dir: dir } : {};
        return call('files.list', args).then(function (res) {
          return res && Array.isArray(res.entries) ? res.entries : [];
        });
      },
      read: function (path, options) {
        var args = { path: path ? String(path) : '' };
        if (options && (options.encoding === 'utf8' || options.encoding === 'base64')) {
          args.encoding = options.encoding;
        }
        if (options && typeof options.maxBytes === 'number') args.maxBytes = options.maxBytes;
        return call('files.read', args);
      },
      write: function (path, content, options) {
        var args = {
          path: path ? String(path) : '',
          content: content == null ? '' : String(content),
        };
        if (options && (options.encoding === 'utf8' || options.encoding === 'base64')) {
          args.encoding = options.encoding;
        }
        if (options && typeof options.append === 'boolean') args.append = options.append;
        return call('files.write', args);
      },
      upload: uploadFile,
      pick: function (options) {
        return call('files.pick', options || {}).then(function (res) {
          return res && Array.isArray(res.files) ? res.files : [];
        });
      },
    },
    // Scoped local command execution (`permissions: ["exec"]` + `capabilities.exec` allowlist).
    exec: {
      run: function (program, args, options) {
        var payload = {
          program: program ? String(program) : '',
          args: Array.isArray(args) ? args.map(String) : [],
        };
        if (options && typeof options.cwd === 'string' && options.cwd) payload.cwd = options.cwd;
        if (options && typeof options.stdin === 'string') payload.stdin = options.stdin;
        if (options && typeof options.timeoutMs === 'number') payload.timeoutMs = options.timeoutMs;
        return call('exec.run', payload);
      },
    },
    // Read-only index of the open Worktree's docs: { features, docs }. Needs the files permission.
    docs: {
      index: function () {
        return call('docs.index');
      },
    },
    // HTTP/HTTPS request proxy. Allows http://127.0.0.1 & http://localhost by default, plus `capabilities.fetch`.
    fetch: function (url, init) {
      init = init || {};
      var payload = { url: url, method: init.method || 'GET', body: init.body || '' };
      if (init.headers && typeof init.headers === 'object') payload.headers = init.headers;
      if (typeof init.timeoutMs === 'number') payload.timeoutMs = init.timeoutMs;
      return call('fetch', payload);
    },
    // Opens a Session, Worktree file preview, or allowlisted external URL (`permissions: ["open"]`).
    ui: {
      open: function (target, options) {
        var payload = {};
        if (typeof target === 'string') {
          if (/^https?:\/\//i.test(target)) payload.url = target;
          else payload.path = target;
          if (options && typeof options.closeDeck === 'boolean') payload.closeDeck = options.closeDeck;
        } else if (target && typeof target === 'object') {
          if (typeof target.url === 'string') payload.url = target.url;
          if (typeof target.path === 'string') payload.path = target.path;
          if (typeof target.sessionId === 'string') payload.sessionId = target.sessionId;
          if (typeof target.closeDeck === 'boolean') payload.closeDeck = target.closeDeck;
        }
        return call('ui.open', payload);
      },
    },
  };

  function applyCommonSessionAttrs(el, out) {
    var focus = el.hasAttribute('data-deck-focus') ? parseBoolAttr(el.getAttribute('data-deck-focus')) : undefined;
    if (typeof focus === 'boolean') out.focus = focus;
    var closeDeck = el.hasAttribute('data-deck-close-deck')
      ? parseBoolAttr(el.getAttribute('data-deck-close-deck'))
      : undefined;
    if (typeof closeDeck === 'boolean') out.closeDeck = closeDeck;
    var provider = el.getAttribute('data-deck-provider');
    if (provider && provider.trim()) out.provider = provider.trim();
    var model = el.getAttribute('data-deck-model');
    if (model && model.trim()) out.model = model.trim();
    var effort = el.getAttribute('data-deck-effort');
    if (effort && effort.trim()) out.effort = effort.trim();
    var permissions = el.getAttribute('data-deck-permissions');
    if (isPermissionTier(permissions)) out.permissions = permissions;
    var loadout = el.getAttribute('data-deck-loadout');
    if (loadout && loadout.trim()) out.loadout = loadout.trim();
    var plan = el.hasAttribute('data-deck-plan') ? parseBoolAttr(el.getAttribute('data-deck-plan')) : undefined;
    if (typeof plan === 'boolean') out.plan = plan;
  }

  // Declarative Deck action & compose buttons.
  if (window.document && typeof window.document.addEventListener === 'function') {
    window.document.addEventListener('click', function (event) {
      var target = event && event.target;
      if (!target || typeof target.closest !== 'function') return;

      var el = target.closest('[data-deck-prompt], [data-deck-skill], [data-deck-compose]');
      if (!el) return;
      if (el.disabled || el.getAttribute('aria-disabled') === 'true' || el.getAttribute('data-deck-busy') === 'true') {
        return;
      }

      if (typeof el.hasAttribute === 'function' && el.hasAttribute('data-deck-compose')) {
        var rawTarget = el.getAttribute('data-deck-compose');
        var composeReq = {
          target: !rawTarget || rawTarget === 'true' ? 'new' : rawTarget,
        };
        var draft = el.getAttribute('data-deck-draft');
        if (draft !== null && draft !== undefined) composeReq.draft = draft;
        var title = el.getAttribute('data-deck-title');
        if (title && title.trim()) composeReq.title = title.trim();
        var items = [];
        var filePath = el.getAttribute('data-deck-file');
        if (filePath && filePath.trim()) items.push({ kind: 'file', path: filePath.trim() });
        var contextBody = el.getAttribute('data-deck-context');
        if (contextBody) items.push({ kind: 'text', body: contextBody });
        if (items.length) composeReq.items = items;
        applyCommonSessionAttrs(el, composeReq);

        el.setAttribute('data-deck-busy', 'true');
        var wasComposeBtn = 'disabled' in el;
        if (wasComposeBtn) el.disabled = true;
        window.deck.agent.compose(composeReq).then(
          function (res) {
            el.removeAttribute('data-deck-busy');
            if (wasComposeBtn) el.disabled = false;
            if (res && res.sessionId) el.setAttribute('data-deck-session-id', res.sessionId);
            emitDomEvent(el, 'deck:compose', res);
          },
          function (err) {
            el.removeAttribute('data-deck-busy');
            if (wasComposeBtn) el.disabled = false;
            report(err && err.message ? err.message : err, err && err.stack);
          },
        );
        return;
      }

      var token = 'rt' + ++seq;
      var req = {
        prompt: el.getAttribute('data-deck-prompt') || '',
        skill: el.getAttribute('data-deck-skill') || '',
        actionId: el.getAttribute('data-deck-action') || '',
        runToken: token,
      };
      var sessionAttr = el.getAttribute('data-deck-session');
      if (sessionAttr && sessionAttr.trim()) req.sessionId = sessionAttr.trim();
      var waitAttr = el.hasAttribute('data-deck-wait') ? parseBoolAttr(el.getAttribute('data-deck-wait')) : undefined;
      if (typeof waitAttr === 'boolean') req.wait = waitAttr;
      var dedupe = el.getAttribute('data-deck-dedupe');
      if (dedupe === 'running' || dedupe === 'session' || dedupe === 'none') req.dedupe = dedupe;
      var dedupeKey = el.getAttribute('data-deck-dedupe-key');
      if (dedupeKey) req.dedupeKey = dedupeKey;
      applyCommonSessionAttrs(el, req);

      tokenButtons[token] = el;
      el.setAttribute('data-deck-busy', 'true');
      el.setAttribute('data-deck-state', 'running');
      var wasButton = 'disabled' in el;
      if (wasButton) el.disabled = true;
      emitDomEvent(el, 'deck:start', req);

      runAgent(req).then(
        function (result) {
          delete tokenButtons[token];
          el.removeAttribute('data-deck-busy');
          if (wasButton) el.disabled = false;
          var finalState = result && result.status ? String(result.status) : 'done';
          el.setAttribute('data-deck-state', finalState);
          if (result && result.sessionId) el.setAttribute('data-deck-session-id', result.sessionId);
          emitDomEvent(el, finalState === 'error' ? 'deck:error' : 'deck:done', result);
        },
        function (error) {
          delete tokenButtons[token];
          el.removeAttribute('data-deck-busy');
          if (wasButton) el.disabled = false;
          el.setAttribute('data-deck-state', 'error');
          emitDomEvent(el, 'deck:error', { error: error && error.message ? error.message : String(error) });
          report(error && error.message ? error.message : error, error && error.stack);
        },
      );
    });
  }
})(window);
