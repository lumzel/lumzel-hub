import { h, clear } from '../lib/dom.js';
import { imeGuard } from '../lib/ime.js';
import { t } from '../i18n.js';

const SCOPES = ['split', 'check', 'impl', 'review', 'general'];

export function createVaultRenderer(store, host) {
  let editingId = null;
  let editDraft = '';
  let editScope = 'general';
  let confirmDeleteId = null;
  let addDraft = '';
  let addScope = 'general';

  return function renderVault(container) {
    clear(container);
    const st = store.get();
    const lessons = st.lessons.list || [];
    const active = lessons.filter(l => l.status === 'active');
    const proposed = lessons.filter(l => l.status === 'proposed');
    const muted = lessons.filter(l => l.status === 'muted');
    const fromFile = st.caps.files === false ? [] : st.fileLessons || [];

    const activeForPreset = host.lessons.getActiveForPreset(st.preset);
    const composed = host.lessons.getComposedPreview(st.preset);

    // Header
    const syncText = st.fileSyncStatus === 'synced' ? t('fileSynced') : t('fileSyncOff');
    container.appendChild(
      h(
        'div',
        { class: 'panel-head', style: { marginBottom: '10px' } },
        h('span', { class: 'mono', style: { fontWeight: '600', fontSize: '12px' } }, t('nextInject', { n: activeForPreset.length })),
        h('span', { class: 'chip' }, syncText),
      ),
    );

    if (st.caps.db === false) {
      container.appendChild(h('div', { class: 'note-box', style: { marginBottom: '12px', borderColor: 'var(--gate)' } }, t('noDbPerm')));
    }

    container.appendChild(
      h('div', { class: 'note-box', style: { marginBottom: '14px', fontSize: '11px' } }, t('vaultPermNote')),
    );

    // Composed preview
    container.appendChild(
      h(
        'div',
        { class: 'sec' },
        h('div', { class: 'sec-hd' }, t('vaultPreview')),
        h('div', { class: 'vault-preview' }, composed.text || '(none)'),
      ),
    );

    function renderLessonRow(item, isMuted = false) {
      const isEditing = editingId === item.id;
      const isDelConfirm = confirmDeleteId === item.id;

      const sw = h('button', {
        type: 'button',
        class: 'switch',
        role: 'switch',
        'aria-checked': item.status === 'active' ? 'true' : 'false',
        onClick: () => host.lessons.setStatus(item.id, item.status === 'active' ? 'muted' : 'active'),
      });

      const body = h('div', { class: 'lesson-main' });
      if (isEditing) {
        const ta = h('textarea', {
          value: editDraft,
          style: { width: '100%', minHeight: '56px', marginBottom: '6px' },
          onInput: e => {
            editDraft = e.target.value;
          },
        });
        ta.value = editDraft;
        const sel = h(
          'select',
          {
            style: { height: '24px', padding: '0 6px', fontSize: '11px' },
            onChange: e => {
              editScope = e.target.value;
            },
          },
          ...SCOPES.map(sc => h('option', { value: sc, selected: sc === editScope }, sc)),
        );
        body.append(
          ta,
          h(
            'div',
            { style: { display: 'flex', gap: '6px', justifyContent: 'space-between' } },
            sel,
            h(
              'div',
              { style: { display: 'flex', gap: '6px' } },
              h(
                'button',
                {
                  type: 'button',
                  class: 'ghost',
                  style: { height: '24px', padding: '0 8px' },
                  onClick: () => {
                    editingId = null;
                    renderVault(container);
                  },
                },
                t('cancel'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'primary',
                  style: { height: '24px', padding: '0 8px' },
                  onClick: () => {
                    host.lessons.update(item.id, { text: editDraft, scope: editScope });
                    editingId = null;
                  },
                },
                t('save'),
              ),
            ),
          ),
        );
      } else {
        body.appendChild(
          h('div', { class: 'lesson-text', style: isMuted ? { color: 'var(--muted)' } : null }, item.text),
        );
        body.appendChild(
          h(
            'div',
            { class: 'lesson-meta' },
            h('span', { class: 'chip', style: { height: '18px', fontSize: '10px' } }, item.scope),
            item.source && item.source.runId
              ? h('span', null, `run ${item.source.runId.slice(0, 4)}`)
              : null,
            h('span', null, `hits ${item.hits || 0}`),
            h(
              'button',
              {
                type: 'button',
                class: 'ghost',
                style: { height: '20px', padding: '0 6px', fontSize: '10.5px' },
                onClick: () => {
                  editingId = item.id;
                  editDraft = item.text;
                  editScope = item.scope || 'general';
                  confirmDeleteId = null;
                  renderVault(container);
                },
              },
              t('edit'),
            ),
            isDelConfirm
              ? h(
                  'button',
                  {
                    type: 'button',
                    class: 'danger-outline',
                    style: { height: '20px', padding: '0 6px', fontSize: '10.5px' },
                    onClick: () => {
                      confirmDeleteId = null;
                      host.lessons.remove(item.id);
                    },
                  },
                  t('confirmDelete'),
                )
              : h(
                  'button',
                  {
                    type: 'button',
                    class: 'ghost',
                    style: { height: '20px', padding: '0 6px', fontSize: '10.5px' },
                    onClick: () => {
                      confirmDeleteId = item.id;
                      renderVault(container);
                    },
                  },
                  t('deleteBtn'),
                ),
          ),
        );
      }

      return h('div', { class: 'lesson-row' }, sw, body);
    }

    if (!lessons.length && !fromFile.length) {
      container.appendChild(h('div', { class: 'empty-state', style: { marginBottom: '12px' } }, t('vaultEmpty')));
    }

    if (active.length) {
      const sec = h('div', { class: 'sec' }, h('div', { class: 'sec-hd' }, `${t('vaultActive')} (${active.length})`));
      for (const item of active) sec.appendChild(renderLessonRow(item, false));
      container.appendChild(sec);
    }

    if (proposed.length) {
      const sec = h('div', { class: 'sec' }, h('div', { class: 'sec-hd' }, `${t('vaultProposed')} (${proposed.length})`));
      for (const item of proposed) {
        const body = h(
          'div',
          { class: 'lesson-main' },
          h('div', { class: 'lesson-text' }, item.text),
          h(
            'div',
            { class: 'lesson-meta' },
            h('span', { class: 'chip', style: { height: '18px', fontSize: '10px', borderColor: 'var(--learn)', color: 'var(--learn)' } }, item.scope),
            item.evidence ? h('span', { class: 'truncate', title: item.evidence }, item.evidence) : null,
          ),
          h(
            'div',
            { style: { display: 'flex', gap: '6px', marginTop: '6px' } },
            h(
              'button',
              {
                type: 'button',
                class: 'primary',
                style: { height: '24px', padding: '0 10px' },
                onClick: () => host.lessons.setStatus(item.id, 'active'),
              },
              t('accept'),
            ),
            h(
              'button',
              {
                type: 'button',
                class: 'ghost',
                style: { height: '24px', padding: '0 8px' },
                onClick: () => host.lessons.setStatus(item.id, 'muted'),
              },
              t('dismiss'),
            ),
          ),
        );
        sec.appendChild(h('div', { class: 'lesson-row' }, body));
      }
      container.appendChild(sec);
    }

    if (fromFile.length) {
      const sec = h('div', { class: 'sec' }, h('div', { class: 'sec-hd' }, `${t('vaultFromFile')} (${fromFile.length})`));
      for (const fl of fromFile) {
        sec.appendChild(
          h(
            'div',
            { class: 'lesson-row' },
            h(
              'div',
              { class: 'lesson-main' },
              h('div', { class: 'lesson-text' }, fl.text),
              h('div', { class: 'lesson-meta' }, h('span', { class: 'chip', style: { height: '18px', fontSize: '10px' } }, fl.scope)),
            ),
            h(
              'button',
              {
                type: 'button',
                class: 'secondary',
                style: { height: '24px', padding: '0 8px' },
                onClick: () => host.lessons.importFromFile(fl),
              },
              t('importBtn'),
            ),
          ),
        );
      }
      container.appendChild(sec);
    }

    if (muted.length) {
      const sec = h('div', { class: 'sec' }, h('div', { class: 'sec-hd' }, `${t('vaultMuted')} (${muted.length})`));
      for (const item of muted) sec.appendChild(renderLessonRow(item, true));
      container.appendChild(sec);
    }

    // Add manual constraint row
    const addInput = h('input', {
      type: 'text',
      maxlength: '280',
      placeholder: t('vaultAddPh'),
      value: addDraft,
      onInput: e => {
        addDraft = e.target.value;
      },
    });
    const scopeSelect = h(
      'select',
      {
        style: { width: '90px', flex: '0 0 auto' },
        onChange: e => {
          addScope = e.target.value;
        },
      },
      ...SCOPES.map(sc => h('option', { value: sc, selected: sc === addScope }, sc)),
    );
    const submitAdd = () => {
      const txt = addDraft.trim();
      if (!txt) return;
      addDraft = '';
      addInput.value = '';
      host.lessons.add(txt, addScope, 'active');
    };
    imeGuard(addInput, submitAdd);

    container.appendChild(
      h(
        'div',
        { class: 'vault-add' },
        addInput,
        scopeSelect,
        h('button', { type: 'button', class: 'secondary', onClick: submitAdd }, t('vaultAdd')),
      ),
    );
  };
}
