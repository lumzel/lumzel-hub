// Lumzel Deck UI Components v1 — lumzel://deck/lib/v1/components.js
// CSP-safe Custom Elements built on top of window.deck (/sdk.js).
(function (window, document) {
  'use strict';

  var activeLocale = document.documentElement.lang || 'en';

  function isZh() {
    return /^zh\b/i.test(activeLocale);
  }

  function label(zh, en) {
    return isZh() ? zh : en;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function parseBoolAttr(host, name) {
    if (!host.hasAttribute(name)) return undefined;
    var v = (host.getAttribute(name) || '').trim().toLowerCase();
    if (v === '' || v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0') return false;
    return undefined;
  }

  function emit(host, name, detail) {
    host.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail: detail }));
  }

  // Sync theme + locale from deck.context() automatically when available.
  if (window.deck && typeof window.deck.context === 'function') {
    window.deck
      .context()
      .then(function (ctx) {
        if (!ctx) return;
        if (ctx.theme && !document.documentElement.hasAttribute('data-theme')) {
          document.documentElement.setAttribute('data-theme', ctx.theme);
        }
        if (ctx.locale) activeLocale = ctx.locale;
      })
      .catch(function () {});
  }

  // 1. <ui-run-button> — background Agent trigger with dedupe lock, live state badge, and Session jump button
  class UiRunButton extends HTMLElement {
    connectedCallback() {
      if (this._mounted) return;
      this._mounted = true;
      var initialLabel = (this.getAttribute('label') || this.textContent || '').trim() || label('运行任务', 'Run');
      while (this.firstChild) this.removeChild(this.firstChild);

      var variant = this.getAttribute('variant') || 'primary';
      var btn = el('button', 'deck-btn deck-btn-' + variant);
      btn.type = 'button';
      var spinner = el('span', 'deck-spinner');
      spinner.hidden = true;
      var textSpan = el('span', '', initialLabel);
      btn.appendChild(spinner);
      btn.appendChild(textSpan);

      var badge = el('span', 'deck-badge');
      badge.hidden = true;

      var jumpBtn = el('button', 'deck-btn deck-btn-ghost', label('查看会话', 'Open Session'));
      jumpBtn.type = 'button';
      jumpBtn.hidden = true;

      this._btn = btn;
      this._spinner = spinner;
      this._textSpan = textSpan;
      this._badge = badge;
      this._jumpBtn = jumpBtn;
      this._sessionId = this.getAttribute('session-id') || '';
      this._result = null;

      var self = this;
      jumpBtn.addEventListener('click', function () {
        if (self._sessionId && window.deck && window.deck.agent) {
          window.deck.agent.open(self._sessionId).catch(function () {});
        }
      });

      btn.addEventListener('click', function () {
        self.trigger();
      });

      this.appendChild(btn);
      this.appendChild(badge);
      this.appendChild(jumpBtn);

      if (window.deck && window.deck.agent && typeof window.deck.agent.onEvent === 'function') {
        this._unsub = window.deck.agent.onEvent('*', function (ev) {
          if (!ev || !self._sessionId || ev.sessionId !== self._sessionId) return;
          self._applyStatus(ev.status);
          emit(self, 'deck:state', ev);
        });
      }
    }

    disconnectedCallback() {
      if (this._unsub) {
        this._unsub();
        this._unsub = null;
      }
    }

    get sessionId() {
      return this._sessionId || '';
    }

    get result() {
      return this._result;
    }

    _applyStatus(status) {
      if (!this._badge) return;
      var showJump = parseBoolAttr(this, 'show-jump');
      if (showJump !== false && this._sessionId) {
        this._jumpBtn.hidden = false;
      }
      if (!status) {
        this._badge.hidden = true;
        return;
      }
      this._badge.hidden = false;
      if (status === 'running') {
        this._badge.setAttribute('data-tone', 'info');
        this._badge.textContent = label('运行中', 'Running');
      } else if (status === 'needs_input') {
        this._badge.setAttribute('data-tone', 'warn');
        this._badge.textContent = label('待确认', 'Needs input');
      } else if (status === 'done' || status === 'idle') {
        this._badge.setAttribute('data-tone', 'ok');
        this._badge.textContent = label('已完成', 'Done');
      } else if (status === 'error') {
        this._badge.setAttribute('data-tone', 'err');
        this._badge.textContent = label('失败', 'Error');
      } else if (status === 'stopped') {
        this._badge.removeAttribute('data-tone');
        this._badge.textContent = label('已停止', 'Stopped');
      } else {
        this._badge.removeAttribute('data-tone');
        this._badge.textContent = status;
      }
    }

    trigger() {
      if (!window.deck || !window.deck.agent || !this._btn || this._btn.disabled) return Promise.resolve(null);
      var req = {
        prompt: (this.getAttribute('prompt') || '').trim(),
        skill: (this.getAttribute('skill') || '').trim() || undefined,
        actionId: (this.getAttribute('action') || '').trim() || undefined,
        sessionId: (this.getAttribute('session-id') || '').trim() || undefined,
        provider: (this.getAttribute('provider') || '').trim() || undefined,
        model: (this.getAttribute('model') || '').trim() || undefined,
        effort: (this.getAttribute('effort') || '').trim() || undefined,
        permissions: (this.getAttribute('permissions') || '').trim() || undefined,
        loadout: (this.getAttribute('loadout') || '').trim() || undefined,
        dedupe: (this.getAttribute('dedupe') || '').trim() || undefined,
        dedupeKey: (this.getAttribute('dedupe-key') || '').trim() || undefined,
      };
      var focus = parseBoolAttr(this, 'focus');
      if (focus !== undefined) req.focus = focus;
      var wait = parseBoolAttr(this, 'wait');
      if (wait !== undefined) req.wait = wait;
      var plan = parseBoolAttr(this, 'plan');
      if (plan !== undefined) req.plan = plan;

      this._btn.disabled = true;
      this._btn.setAttribute('data-deck-busy', 'true');
      this._spinner.hidden = false;
      this._applyStatus('running');
      emit(this, 'deck:start', { request: req });

      var self = this;
      return window.deck.agent
        .run(req)
        .then(function (res) {
          self._result = res;
          if (res && res.sessionId) {
            self._sessionId = res.sessionId;
            self.setAttribute('data-deck-session-id', res.sessionId);
          }
          self._applyStatus((res && res.status) || 'done');
          emit(self, 'deck:done', res);
          return res;
        })
        .catch(function (err) {
          self._applyStatus('error');
          emit(self, 'deck:error', { error: err && err.message ? err.message : String(err) });
          throw err;
        })
        .finally(function () {
          self._btn.disabled = false;
          self._btn.removeAttribute('data-deck-busy');
          self._spinner.hidden = true;
        });
    }
  }

  // 2. <ui-log-stream> — live Session event & streaming output viewer
  class UiLogStream extends HTMLElement {
    static get observedAttributes() {
      return ['session-id'];
    }

    connectedCallback() {
      if (!this._mounted) {
        this._mounted = true;
        var bar = el('div', 'deck-log-bar');
        var left = el('div', 'deck-row');
        this._titleEl = el('strong', '', label('执行日志', 'Session Logs'));
        this._statusBadge = el('span', 'deck-badge', label('空闲', 'Idle'));
        left.appendChild(this._titleEl);
        left.appendChild(this._statusBadge);

        var right = el('div', 'deck-row');
        this._openBtn = el('button', 'deck-btn deck-btn-ghost', label('跳转会话', 'Jump to Session'));
        this._openBtn.type = 'button';
        this._openBtn.hidden = true;
        var self = this;
        this._openBtn.addEventListener('click', function () {
          if (self._currentSessionId && window.deck && window.deck.agent) {
            window.deck.agent.open(self._currentSessionId).catch(function () {});
          }
        });
        right.appendChild(this._openBtn);
        bar.appendChild(left);
        bar.appendChild(right);

        this._body = el('pre', 'deck-log-body', this.getAttribute('placeholder') || label('等待任务执行…', 'Waiting for Agent activity…'));
        this.appendChild(bar);
        this.appendChild(this._body);
      }
      this._bindSession();
    }

    attributeChangedCallback() {
      if (this._mounted) this._bindSession();
    }

    disconnectedCallback() {
      if (this._unsub) {
        this._unsub();
        this._unsub = null;
      }
    }

    _bindSession() {
      if (this._unsub) {
        this._unsub();
        this._unsub = null;
      }
      var target = (this.getAttribute('session-id') || '*').trim() || '*';
      this._lines = [];
      var self = this;
      if (!window.deck || !window.deck.agent) return;
      if (target !== '*') {
        this._currentSessionId = target;
        window.deck.agent
          .logs(target, { afterSeq: 0 })
          .then(function (snap) {
            self._renderSnapshot(snap);
          })
          .catch(function () {});
      }
      if (typeof window.deck.agent.onEvent === 'function') {
        this._unsub = window.deck.agent.onEvent(target, function (snap) {
          self._renderSnapshot(snap);
        });
      }
    }

    _renderSnapshot(snap) {
      if (!snap || !this._body) return;
      if (snap.sessionId) {
        this._currentSessionId = snap.sessionId;
        this._openBtn.hidden = false;
      }
      if (snap.label) {
        this._titleEl.textContent = snap.label;
      }
      if (snap.status) {
        this._statusBadge.textContent = snap.status;
        this._statusBadge.setAttribute(
          'data-tone',
          snap.status === 'running' ? 'info' : snap.status === 'error' ? 'err' : snap.status === 'needs_input' ? 'warn' : 'ok',
        );
      }
      var events = Array.isArray(snap.events) ? snap.events : [];
      for (var i = 0; i < events.length; i++) {
        var ev = events[i];
        if (!ev || !ev.text) continue;
        this._lines.push('[' + ev.kind + '] ' + ev.text);
      }
      var maxLines = parseInt(this.getAttribute('max-lines') || '120', 10) || 120;
      if (this._lines.length > maxLines) {
        this._lines = this._lines.slice(this._lines.length - maxLines);
      }
      var out = this._lines.join('\n');
      if (snap.liveThinking) {
        out += (out ? '\n\n' : '') + '💭 ' + snap.liveThinking;
      }
      if (snap.streaming) {
        out += (out ? '\n\n' : '') + snap.streaming;
      }
      if (out) {
        this._body.textContent = out;
        this._body.scrollTop = this._body.scrollHeight;
      }
    }
  }

  // 3. <ui-file-drop> — drag-and-drop + native macOS file picker into scoped Deck files
  class UiFileDrop extends HTMLElement {
    connectedCallback() {
      if (this._mounted) return;
      this._mounted = true;
      var dir = (this.getAttribute('dir') || 'uploads').trim().replace(/\/+$/, '');
      var multiple = parseBoolAttr(this, 'multiple') !== false;
      var overwrite = parseBoolAttr(this, 'overwrite') !== false;
      var mode = (this.getAttribute('mode') || 'both').trim();
      var acceptRaw = (this.getAttribute('accept') || '').trim();
      var acceptList = acceptRaw
        ? acceptRaw
            .split(',')
            .map(function (s) {
              return s.trim();
            })
            .filter(Boolean)
        : [];

      var zone = el('div', 'deck-dropzone');
      var promptText =
        this.getAttribute('label') ||
        label('拖拽文件到此处，或使用系统文件选择器导入到项目', 'Drop files here or pick from your Mac');
      var p = el('div', '', promptText);
      zone.appendChild(p);

      var actions = el('div', 'deck-row');
      actions.style.justifyContent = 'center';
      actions.style.marginTop = '8px';

      var chips = el('div', 'deck-file-chips');
      var self = this;

      function addChips(items) {
        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          var chip = el('span', 'deck-badge deck-badge-ok', item.path + ' (' + Math.round((item.size || 0) / 1024) + ' KB)');
          chips.appendChild(chip);
        }
        emit(self, 'deck:files', { files: items });
      }

      if (mode !== 'drop') {
        var pickBtn = el('button', 'deck-btn', label('选择本地文件…', 'Choose Files…'));
        pickBtn.type = 'button';
        pickBtn.addEventListener('click', function () {
          if (!window.deck || !window.deck.files) return;
          pickBtn.disabled = true;
          window.deck.files
            .pick({ dir: dir, multiple: multiple, accept: acceptList, overwrite: overwrite })
            .then(function (res) {
              if (res && Array.isArray(res.files) && res.files.length > 0) {
                addChips(res.files);
              }
            })
            .catch(function (err) {
              emit(self, 'deck:error', { error: err && err.message ? err.message : String(err) });
            })
            .finally(function () {
              pickBtn.disabled = false;
            });
        });
        actions.appendChild(pickBtn);
      }

      if (mode !== 'pick') {
        zone.addEventListener('dragover', function (e) {
          e.preventDefault();
          zone.setAttribute('data-dragover', 'true');
        });
        zone.addEventListener('dragleave', function () {
          zone.removeAttribute('data-dragover');
        });
        zone.addEventListener('drop', function (e) {
          e.preventDefault();
          zone.removeAttribute('data-dragover');
          if (!window.deck || !window.deck.files || !e.dataTransfer || !e.dataTransfer.files) return;
          var dropped = Array.prototype.slice.call(e.dataTransfer.files, 0, multiple ? e.dataTransfer.files.length : 1);
          Promise.all(
            dropped.map(function (file) {
              var targetPath = (dir ? dir + '/' : '') + file.name;
              return window.deck.files.uploadFile(targetPath, file, { overwrite: overwrite });
            }),
          )
            .then(function (results) {
              addChips(results);
            })
            .catch(function (err) {
              emit(self, 'deck:error', { error: err && err.message ? err.message : String(err) });
            });
        });
      }

      zone.appendChild(actions);
      this.appendChild(zone);
      this.appendChild(chips);
    }
  }

  // 4. <ui-card> — titled surface card
  class UiCard extends HTMLElement {
    connectedCallback() {
      if (this._mounted) return;
      this._mounted = true;
      var title = this.getAttribute('title');
      var subtitle = this.getAttribute('subtitle');
      var badgeText = this.getAttribute('badge');
      var tone = this.getAttribute('tone') || '';
      if (!title && !badgeText) return;

      var head = el('div', 'deck-card-head');
      var titleBox = el('div');
      if (title) titleBox.appendChild(el('h3', 'deck-card-title', title));
      if (subtitle) titleBox.appendChild(el('p', 'deck-card-subtitle', subtitle));
      head.appendChild(titleBox);
      if (badgeText) {
        var badge = el('span', 'deck-badge', badgeText);
        if (tone) badge.setAttribute('data-tone', tone);
        head.appendChild(badge);
      }
      this.insertBefore(head, this.firstChild);
    }
  }

  // 5. <ui-kpi> — reactive metric tile
  class UiKpi extends HTMLElement {
    static get observedAttributes() {
      return ['label', 'value', 'delta', 'trend', 'hint'];
    }

    connectedCallback() {
      if (!this._mounted) {
        this._mounted = true;
        this._labelEl = el('div', 'deck-kpi-label');
        this._valueEl = el('div', 'deck-kpi-value');
        this._metaEl = el('div', 'deck-kpi-meta');
        this._deltaEl = el('span', 'deck-kpi-delta');
        this._hintEl = el('span');
        this._metaEl.appendChild(this._deltaEl);
        this._metaEl.appendChild(this._hintEl);
        this.appendChild(this._labelEl);
        this.appendChild(this._valueEl);
        this.appendChild(this._metaEl);
      }
      this._sync();
    }

    attributeChangedCallback() {
      if (this._mounted) this._sync();
    }

    _sync() {
      this._labelEl.textContent = this.getAttribute('label') || '';
      this._valueEl.textContent = this.getAttribute('value') || '—';
      var delta = this.getAttribute('delta') || '';
      var hint = this.getAttribute('hint') || '';
      this._deltaEl.textContent = delta;
      this._deltaEl.setAttribute('data-trend', this.getAttribute('trend') || 'neutral');
      this._hintEl.textContent = hint;
      this._metaEl.hidden = !delta && !hint;
    }
  }

  // 6. <ui-tabs> — accessible tab switcher over child [data-tab] panels
  class UiTabs extends HTMLElement {
    connectedCallback() {
      if (this._mounted) return;
      this._mounted = true;
      var panels = Array.prototype.slice.call(this.querySelectorAll(':scope > [data-tab]'));
      if (panels.length === 0) return;

      var bar = el('div', 'deck-tablist');
      bar.setAttribute('role', 'tablist');
      var active = this.getAttribute('active') || panels[0].getAttribute('data-tab');
      var buttons = [];
      var self = this;

      function select(tabId) {
        self.setAttribute('active', tabId);
        for (var i = 0; i < panels.length; i++) {
          var id = panels[i].getAttribute('data-tab');
          var isSel = id === tabId;
          panels[i].hidden = !isSel;
          buttons[i].setAttribute('aria-selected', isSel ? 'true' : 'false');
        }
        emit(self, 'deck:tab', { tab: tabId });
      }

      for (var i = 0; i < panels.length; i++) {
        (function (idx) {
          var panel = panels[idx];
          var id = panel.getAttribute('data-tab');
          var text = panel.getAttribute('data-label') || id;
          var btn = el('button', 'deck-tab', text);
          btn.type = 'button';
          btn.setAttribute('role', 'tab');
          btn.addEventListener('click', function () {
            select(id);
          });
          buttons.push(btn);
          bar.appendChild(btn);
        })(i);
      }

      this.insertBefore(bar, this.firstChild);
      select(active);
    }
  }

  // 7. <ui-data-table> — structured table driven by .columns and .rows
  class UiDataTable extends HTMLElement {
    constructor() {
      super();
      this._columns = [];
      this._rows = [];
    }

    connectedCallback() {
      this._render();
    }

    get columns() {
      return this._columns;
    }

    set columns(cols) {
      this._columns = Array.isArray(cols) ? cols : [];
      this._render();
    }

    get rows() {
      return this._rows;
    }

    set rows(list) {
      this._rows = Array.isArray(list) ? list : [];
      this._render();
    }

    _render() {
      while (this.firstChild) this.removeChild(this.firstChild);
      var cols = this._columns;
      var rows = this._rows;
      if (cols.length === 0 && rows.length > 0 && rows[0] && typeof rows[0] === 'object') {
        cols = Object.keys(rows[0]).map(function (k) {
          return { key: k, label: k };
        });
      }
      if (rows.length === 0) {
        var empty = el('div', '', this.getAttribute('empty-text') || label('暂无数据', 'No records'));
        empty.style.color = 'var(--deck-muted)';
        empty.style.padding = '12px 4px';
        this.appendChild(empty);
        return;
      }
      var table = el('table', 'deck-table');
      var thead = el('thead');
      var headRow = el('tr');
      for (var c = 0; c < cols.length; c++) {
        var th = el('th', '', cols[c].label || cols[c].key);
        if (cols[c].align) th.style.textAlign = cols[c].align;
        headRow.appendChild(th);
      }
      thead.appendChild(headRow);
      table.appendChild(thead);

      var tbody = el('tbody');
      var self = this;
      for (var r = 0; r < rows.length; r++) {
        (function (rowIdx) {
          var row = rows[rowIdx];
          var tr = el('tr');
          tr.style.cursor = 'pointer';
          for (var c = 0; c < cols.length; c++) {
            var col = cols[c];
            var td = el('td');
            if (col.align) td.style.textAlign = col.align;
            var val = row ? row[col.key] : '';
            if (typeof col.render === 'function') {
              var rendered = col.render(val, row, rowIdx);
              if (rendered && rendered.nodeType === 1) td.appendChild(rendered);
              else td.textContent = rendered === undefined || rendered === null ? '' : String(rendered);
            } else {
              td.textContent = val === undefined || val === null ? '' : String(val);
            }
            tr.appendChild(td);
          }
          tr.addEventListener('click', function () {
            emit(self, 'deck:row-click', { row: row, index: rowIdx });
          });
          tbody.appendChild(tr);
        })(r);
      }
      table.appendChild(tbody);
      this.appendChild(table);
    }
  }

  // 8. <ui-modal> — accessible modal dialog
  class UiModal extends HTMLElement {
    connectedCallback() {
      if (this._mounted) return;
      this._mounted = true;
      var panel = el('div', 'deck-modal-panel');
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');

      var head = el('div', 'deck-card-head');
      var title = el('h3', 'deck-card-title', this.getAttribute('title') || '');
      var closeBtn = el('button', 'deck-btn deck-btn-ghost', '✕');
      closeBtn.type = 'button';
      var self = this;
      closeBtn.addEventListener('click', function () {
        self.close();
      });
      head.appendChild(title);
      head.appendChild(closeBtn);

      var body = el('div', 'deck-stack');
      while (this.firstChild) {
        body.appendChild(this.firstChild);
      }
      panel.appendChild(head);
      panel.appendChild(body);
      this.appendChild(panel);

      this.addEventListener('click', function (e) {
        if (e.target === self) self.close();
      });
      this._onKey = function (e) {
        if (e.key === 'Escape' && self.hasAttribute('open')) self.close();
      };
      document.addEventListener('keydown', this._onKey);
    }

    disconnectedCallback() {
      if (this._onKey) {
        document.removeEventListener('keydown', this._onKey);
        this._onKey = null;
      }
    }

    show() {
      this.setAttribute('open', '');
    }

    close() {
      this.removeAttribute('open');
      emit(this, 'deck:close', {});
    }
  }

  var registry = [
    ['ui-run-button', UiRunButton],
    ['ui-log-stream', UiLogStream],
    ['ui-file-drop', UiFileDrop],
    ['ui-card', UiCard],
    ['ui-kpi', UiKpi],
    ['ui-tabs', UiTabs],
    ['ui-data-table', UiDataTable],
    ['ui-modal', UiModal],
  ];
  for (var i = 0; i < registry.length; i++) {
    if (!window.customElements.get(registry[i][0])) {
      window.customElements.define(registry[i][0], registry[i][1]);
    }
  }
})(window, document);
