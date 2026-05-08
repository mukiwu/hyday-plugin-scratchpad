'use strict';

const SAVE_DEBOUNCE_MS = 500;

class ScratchpadPlugin {
  constructor(app, manifest) {
    this.app = app;
    this.manifest = manifest;
    this._handles = [];
    this._content = '';
    this._saveTimer = null;
  }

  async onload() {
    const stored = await this.app.storage.load();
    if (stored && typeof stored === 'object' && typeof stored.content === 'string') {
      this._content = stored.content;
    }

    this._handles.push(
      this.app.ui.addStatusBarItem({
        id: 'scratchpad',
        label: '便籤',
        icon: 'sticky-note',
        position: 'navBar',
        order: 10,
        badge: () => (this._content.length > 0 ? 1 : undefined),
        panel: {
          width: 360,
          maxHeight: 480,
          mount: (container, close) => this._mount(container, close),
        },
      }),
    );
  }

  async onunload() {
    await this._flushSave();
    for (const h of this._handles) {
      try {
        h.dispose();
      } catch (e) {
        void e;
      }
    }
    this._handles = [];
  }

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      void this._save();
    }, SAVE_DEBOUNCE_MS);
  }

  async _flushSave() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
      await this._save();
    }
  }

  async _save() {
    await this.app.storage.save({ content: this._content });
  }

  _mount(container, _close) {
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.padding = '12px';
    container.style.gap = '8px';
    container.style.width = '100%';
    container.style.boxSizing = 'border-box';

    /* ─── Toolbar ─────────────────────────────────────── */
    const toolbar = document.createElement('div');
    toolbar.style.display = 'flex';
    toolbar.style.alignItems = 'center';
    toolbar.style.justifyContent = 'space-between';
    toolbar.style.gap = '8px';

    const title = document.createElement('div');
    title.textContent = '便籤';
    title.style.fontSize = '13px';
    title.style.fontFamily = 'monospace';
    title.style.textTransform = 'uppercase';
    title.style.letterSpacing = '0.08em';
    title.style.color = 'var(--foreground-muted, #6b7280)';
    toolbar.appendChild(title);

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '4px';

    const makeBtn = (label) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.fontSize = '13px';
      b.style.padding = '3px 10px';
      b.style.borderRadius = '5px';
      b.style.background = 'transparent';
      b.style.color = 'var(--foreground-muted, #6b7280)';
      b.style.border = '1px solid var(--border, #d1d5db)';
      b.style.cursor = 'pointer';
      b.style.outline = 'none';
      b.addEventListener('mouseenter', () => {
        if (b.dataset.confirming !== '1') {
          b.style.color = 'var(--foreground, #111827)';
        }
      });
      b.addEventListener('mouseleave', () => {
        if (b.dataset.confirming !== '1') {
          b.style.color = 'var(--foreground-muted, #6b7280)';
        }
      });
      return b;
    };

    const toNoteBtn = makeBtn('→ 筆記');
    const toJournalBtn = makeBtn('→ 日記');
    const copyBtn = makeBtn('複製');
    const clearBtn = makeBtn('清除');
    actions.appendChild(toNoteBtn);
    actions.appendChild(toJournalBtn);
    actions.appendChild(copyBtn);
    actions.appendChild(clearBtn);
    toolbar.appendChild(actions);
    container.appendChild(toolbar);

    /* ─── Textarea ────────────────────────────────────── */
    const textarea = document.createElement('textarea');
    textarea.value = this._content;
    textarea.placeholder = '臨時記下想法、電話、待辦…\n離開自動保存，不會消失。';
    textarea.style.flex = '1';
    textarea.style.width = '100%';
    textarea.style.minHeight = '320px';
    textarea.style.padding = '10px 12px';
    textarea.style.borderRadius = '6px';
    textarea.style.border = '1px solid var(--border, #d1d5db)';
    textarea.style.background = 'var(--background, white)';
    textarea.style.color = 'var(--foreground, #111827)';
    textarea.style.fontSize = '14px';
    textarea.style.fontFamily = 'inherit';
    textarea.style.lineHeight = '1.55';
    textarea.style.resize = 'none';
    textarea.style.outline = 'none';
    textarea.style.boxSizing = 'border-box';
    container.appendChild(textarea);
    setTimeout(() => textarea.focus(), 50);

    /* ─── Footer counter ──────────────────────────────── */
    const countEl = document.createElement('div');
    countEl.style.fontSize = '13px';
    countEl.style.fontFamily = 'monospace';
    countEl.style.color = 'var(--foreground-muted, #6b7280)';
    countEl.style.textAlign = 'right';
    const updateCount = () => {
      countEl.textContent = this._content.length + ' 字';
    };
    updateCount();
    container.appendChild(countEl);

    /* ─── Handlers ───────────────────────────────────── */
    textarea.addEventListener('input', () => {
      this._content = textarea.value;
      updateCount();
      this._scheduleSave();
    });

    copyBtn.addEventListener('click', async () => {
      if (!this._content) {
        this.app.ui.showNotice('便籤是空的，沒東西可複製', { type: 'info' });
        return;
      }
      try {
        await navigator.clipboard.writeText(this._content);
        this.app.ui.showNotice('已複製到剪貼簿', { type: 'success' });
      } catch (e) {
        void e;
        this.app.ui.showNotice('複製失敗，請重試', { type: 'error' });
      }
    });

    toNoteBtn.addEventListener('click', async () => {
      if (!this._content.trim()) {
        this.app.ui.showNotice('便籤是空的，沒內容可新增', { type: 'info' });
        return;
      }
      // Title 固定用當下時間：便籤 YYYY-MM-DD HH:mm
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const stamp = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
        + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
      const title = '便籤 ' + stamp;
      try {
        const id = await this.app.notes.create({ title, bodyMarkdown: this._content });
        this.app.workspace.openNote(id);
        this.app.ui.showNotice('已新增筆記「' + title + '」', { type: 'success' });
      } catch (err) {
        this.app.ui.showNotice('新增失敗：' + (err && err.message ? err.message : String(err)), { type: 'error' });
      }
    });

    toJournalBtn.addEventListener('click', async () => {
      if (!this._content.trim()) {
        this.app.ui.showNotice('便籤是空的，沒內容可新增', { type: 'info' });
        return;
      }
      try {
        const date = await this.app.notes.appendToJournal({ text: this._content });
        this.app.ui.showNotice('已附加到 ' + date + ' 日記', { type: 'success' });
      } catch (err) {
        this.app.ui.showNotice('附加失敗：' + (err && err.message ? err.message : String(err)), { type: 'error' });
      }
    });

    let confirmingClear = false;
    let confirmTimer = null;
    const resetClearButton = () => {
      confirmingClear = false;
      clearBtn.textContent = '清除';
      clearBtn.dataset.confirming = '0';
      clearBtn.style.color = 'var(--foreground-muted, #6b7280)';
      clearBtn.style.borderColor = 'var(--border, #d1d5db)';
      if (confirmTimer) {
        clearTimeout(confirmTimer);
        confirmTimer = null;
      }
    };
    clearBtn.addEventListener('click', () => {
      if (!this._content) return;
      if (!confirmingClear) {
        confirmingClear = true;
        clearBtn.textContent = '確定？';
        clearBtn.dataset.confirming = '1';
        clearBtn.style.color = 'var(--danger-text, #b91c1c)';
        clearBtn.style.borderColor = 'var(--danger-text, #b91c1c)';
        confirmTimer = setTimeout(resetClearButton, 3000);
        return;
      }
      // Confirmed — actually clear
      this._content = '';
      textarea.value = '';
      updateCount();
      this._scheduleSave();
      resetClearButton();
    });

    return () => {
      void this._flushSave();
      resetClearButton();
    };
  }
}

module.exports = ScratchpadPlugin;
