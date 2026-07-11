/**
 * OpenIn - 统一 Toast / 弹框 UI
 * Shadow DOM 隔离样式，单例管理生命周期与动画
 */
(function initOpenInToast(global) {
  'use strict';

  const OpenIn = global.OpenIn;
  if (!OpenIn) return;

  const STYLE_ID = 'openin-toast-styles';
  const HOST_ID = 'openin-toast-host';

  const TOAST_CSS = `
    :host {
      all: initial;
    }

    .viewport {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      gap: 12px;
      pointer-events: none;
      font-family: "Segoe UI", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    }

    .toast {
      --accent: #58a6ff;
      --accent-soft: color-mix(in srgb, var(--accent) 18%, transparent);
      --accent-glow: color-mix(in srgb, var(--accent) 35%, transparent);
      position: relative;
      width: min(380px, calc(100vw - 40px));
      pointer-events: auto;
      border-radius: 14px;
      overflow: hidden;
      background:
        radial-gradient(120% 140% at 100% 0%, var(--accent-soft), transparent 55%),
        linear-gradient(145deg, rgba(22, 27, 34, 0.94) 0%, rgba(13, 17, 23, 0.97) 100%);
      border: 1px solid color-mix(in srgb, var(--accent) 28%, rgba(255, 255, 255, 0.08));
      box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.03) inset,
        0 18px 40px rgba(0, 0, 0, 0.42),
        0 0 24px var(--accent-glow);
      backdrop-filter: blur(16px) saturate(140%);
      -webkit-backdrop-filter: blur(16px) saturate(140%);
      color: #e6edf3;
      transform: translateX(28px) scale(0.96);
      opacity: 0;
      animation: openin-enter 420ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
    }

    .toast.is-leaving {
      animation: openin-leave 280ms cubic-bezier(0.4, 0, 1, 1) forwards;
    }

    @keyframes openin-enter {
      to {
        transform: translateX(0) scale(1);
        opacity: 1;
      }
    }

    @keyframes openin-leave {
      to {
        transform: translateX(24px) scale(0.96);
        opacity: 0;
      }
    }

    .accent-bar {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      background: linear-gradient(180deg, var(--accent), color-mix(in srgb, var(--accent) 40%, #fff));
      box-shadow: 0 0 12px var(--accent-glow);
    }

    .body {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 12px;
      align-items: start;
      padding: 14px 14px 12px 16px;
    }

    .badge {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      font-size: 18px;
      background: var(--accent-soft);
      border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
      flex-shrink: 0;
    }

    .content {
      min-width: 0;
      padding-top: 1px;
    }

    .title {
      margin: 0 0 4px;
      font-size: 13px;
      line-height: 1.45;
      color: #c9d1d9;
      font-weight: 500;
      letter-spacing: 0.01em;
    }

    .highlight {
      display: inline-block;
      margin-top: 2px;
      padding: 2px 8px;
      border-radius: 6px;
      font-family: ui-monospace, "Cascadia Code", "SF Mono", Consolas, monospace;
      font-size: 12px;
      font-weight: 600;
      color: #f0f6fc;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.08);
      word-break: break-all;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
    }

    .btn {
      appearance: none;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.04);
      color: #e6edf3;
      border-radius: 8px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.2;
      cursor: pointer;
      transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
    }

    .btn:hover {
      background: rgba(255, 255, 255, 0.09);
      border-color: rgba(255, 255, 255, 0.2);
      transform: translateY(-1px);
    }

    .btn-primary {
      background: color-mix(in srgb, var(--accent) 82%, #0d1117);
      border-color: color-mix(in srgb, var(--accent) 70%, transparent);
      color: #fff;
      box-shadow: 0 6px 16px color-mix(in srgb, var(--accent) 28%, transparent);
    }

    .btn-primary:hover {
      background: color-mix(in srgb, var(--accent) 92%, #0d1117);
      border-color: var(--accent);
    }

    .kbd {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 5px 10px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #f0f6fc;
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.06) inset;
    }

    .close {
      appearance: none;
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: #8b949e;
      cursor: pointer;
      display: grid;
      place-items: center;
      font-size: 16px;
      line-height: 1;
      transition: background 160ms ease, color 160ms ease;
    }

    .close:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #f0f6fc;
    }

    .progress {
      height: 2px;
      background: rgba(255, 255, 255, 0.06);
      transform-origin: left center;
      animation: openin-progress linear forwards;
    }

    @keyframes openin-progress {
      from { transform: scaleX(1); }
      to { transform: scaleX(0); }
    }

    @media (prefers-reduced-motion: reduce) {
      .toast,
      .toast.is-leaving,
      .progress {
        animation: none !important;
        transform: none !important;
        opacity: 1 !important;
      }
    }
  `;

  class ToastManager {
    constructor() {
      this.host = null;
      this.shadow = null;
      this.viewport = null;
      this.active = new Map();
      this.cleanups = new Map();
    }

    ensureHost() {
      if (this.host?.isConnected) return;

      this.host = document.createElement('div');
      this.host.id = HOST_ID;
      this.shadow = this.host.attachShadow({ mode: 'closed' });

      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = TOAST_CSS;
      this.shadow.appendChild(style);

      this.viewport = document.createElement('div');
      this.viewport.className = 'viewport';
      this.shadow.appendChild(this.viewport);

      (document.documentElement || document.body).appendChild(this.host);
    }

    dismiss(id) {
      const record = this.active.get(id);
      if (!record) return;

      const cleanup = this.cleanups.get(id);
      if (cleanup) {
        cleanup();
        this.cleanups.delete(id);
      }

      if (record.timer) {
        clearTimeout(record.timer);
      }

      record.el.classList.add('is-leaving');
      record.el.addEventListener('animationend', () => {
        record.el.remove();
        this.active.delete(id);
        if (this.active.size === 0 && this.host?.isConnected) {
          this.host.remove();
          this.host = null;
          this.shadow = null;
          this.viewport = null;
        }
      }, { once: true });
    }

    show(options) {
      const {
        id,
        platform,
        title,
        highlight,
        actions = [],
        shortcut,
        ttl = 10000,
        onClose,
        onShortcut
      } = options;

      if (this.active.has(id)) {
        this.dismiss(id);
      }

      this.ensureHost();

      const meta = OpenIn.getPlatformMeta(platform);
      const toast = document.createElement('article');
      toast.className = 'toast';
      toast.style.setProperty('--accent', meta.color);
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');

      const accent = document.createElement('div');
      accent.className = 'accent-bar';
      toast.appendChild(accent);

      const body = document.createElement('div');
      body.className = 'body';

      const badge = document.createElement('div');
      badge.className = 'badge';
      badge.textContent = meta.abbr;
      badge.setAttribute('aria-hidden', 'true');

      const content = document.createElement('div');
      content.className = 'content';

      const titleEl = document.createElement('p');
      titleEl.className = 'title';
      titleEl.textContent = title;
      content.appendChild(titleEl);

      if (highlight) {
        const highlightEl = document.createElement('span');
        highlightEl.className = 'highlight';
        highlightEl.textContent = highlight;
        content.appendChild(highlightEl);
      }

      const hasFooter = actions.length > 0 || shortcut;
      if (hasFooter) {
        const actionsEl = document.createElement('div');
        actionsEl.className = 'actions';

        actions.forEach((action) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = action.primary ? 'btn btn-primary' : 'btn';
          btn.textContent = action.label;
          btn.addEventListener('click', () => {
            action.onClick?.();
            if (action.dismiss !== false) {
              this.dismiss(id);
            }
          });
          actionsEl.appendChild(btn);
        });

        if (shortcut) {
          const kbd = document.createElement('span');
          kbd.className = 'kbd';
          kbd.textContent = shortcut;
          actionsEl.appendChild(kbd);
        }

        content.appendChild(actionsEl);
      }

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'close';
      closeBtn.setAttribute('aria-label', 'Close');
      closeBtn.textContent = '×';
      closeBtn.addEventListener('click', () => {
        onClose?.();
        this.dismiss(id);
      });

      body.appendChild(badge);
      body.appendChild(content);
      body.appendChild(closeBtn);
      toast.appendChild(body);

      if (ttl > 0) {
        const progress = document.createElement('div');
        progress.className = 'progress';
        progress.style.animationDuration = `${ttl}ms`;
        progress.style.background = `linear-gradient(90deg, ${meta.color}, color-mix(in srgb, ${meta.color} 55%, #fff))`;
        toast.appendChild(progress);
      }

      this.viewport.appendChild(toast);

      const cleanupFns = [];

      if (onShortcut) {
        const removeTab = OpenIn.onTabKey(() => {
          onShortcut();
          this.dismiss(id);
        });
        cleanupFns.push(removeTab);
      }

      let timer = null;
      if (ttl > 0) {
        timer = setTimeout(() => {
          onClose?.();
          this.dismiss(id);
        }, ttl);
      }

      this.cleanups.set(id, () => {
        cleanupFns.forEach((fn) => fn());
      });

      this.active.set(id, { el: toast, timer });
      return id;
    }
  }

  OpenIn.toast = new ToastManager();
})(globalThis);
