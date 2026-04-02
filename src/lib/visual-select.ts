/**
 * Visual Selection Script — injected into preview iframe via postMessage.
 * When active, hovering highlights elements and clicking sends element info
 * back to the parent window.
 */

export const VISUAL_SELECT_INJECT_SCRIPT = `
(function() {
  if (window.__vibeLockSelectMode) return;
  window.__vibeLockSelectMode = true;

  let overlay = document.createElement('div');
  overlay.id = 'vibelock-select-overlay';
  overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:99999;border:2px solid #FF6B2C;border-radius:4px;background:rgba(255,107,44,0.08);transition:all 0.15s ease;display:none;';
  document.body.appendChild(overlay);

  let label = document.createElement('div');
  label.style.cssText = 'position:fixed;z-index:100000;pointer-events:none;background:#FF6B2C;color:white;font-size:11px;font-family:system-ui;padding:2px 8px;border-radius:4px;white-space:nowrap;display:none;';
  document.body.appendChild(label);

  function getElementInfo(el) {
    const tag = el.tagName.toLowerCase();
    const classes = el.className ? el.className.toString().split(' ').filter(c => c.length < 40).slice(0, 5).join(' ') : '';
    const text = (el.textContent || '').trim().slice(0, 80);
    const id = el.id || '';
    const rect = el.getBoundingClientRect();
    return { tag, classes, text, id, width: Math.round(rect.width), height: Math.round(rect.height) };
  }

  document.addEventListener('mousemove', function(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === overlay || el === label || el.id === 'vibelock-select-overlay') return;
    const rect = el.getBoundingClientRect();
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    overlay.style.display = 'block';
    const info = getElementInfo(el);
    label.textContent = '<' + info.tag + '>' + (info.text ? ' ' + info.text.slice(0,30) : '');
    label.style.left = rect.left + 'px';
    label.style.top = Math.max(0, rect.top - 24) + 'px';
    label.style.display = 'block';
  });

  document.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === overlay || el === label) return;
    const info = getElementInfo(el);

    // Walk up to find the nearest meaningful component
    let component = el;
    for (let i = 0; i < 5; i++) {
      if (component.parentElement && component.parentElement !== document.body) {
        const parent = component.parentElement;
        if (parent.children.length <= 3 && parent.tagName !== 'BODY' && parent.tagName !== 'HTML') {
          component = parent;
        } else break;
      } else break;
    }
    const componentInfo = getElementInfo(component);

    window.parent.postMessage({
      type: 'vibelock-element-select',
      element: info,
      component: componentInfo,
      path: getElementPath(el),
    }, '*');
  }, true);

  function getElementPath(el) {
    const path = [];
    let current = el;
    while (current && current !== document.body && path.length < 5) {
      const tag = current.tagName.toLowerCase();
      const cls = current.className ? '.' + current.className.toString().split(' ')[0] : '';
      path.unshift(tag + cls);
      current = current.parentElement;
    }
    return path.join(' > ');
  }
})();
`;

export const VISUAL_SELECT_REMOVE_SCRIPT = `
(function() {
  window.__vibeLockSelectMode = false;
  const overlay = document.getElementById('vibelock-select-overlay');
  if (overlay) overlay.remove();
  const labels = document.querySelectorAll('[style*="z-index:100000"]');
  labels.forEach(l => l.remove());
})();
`;

export interface SelectedElement {
  tag: string;
  classes: string;
  text: string;
  id: string;
  width: number;
  height: number;
}

export interface ElementSelection {
  element: SelectedElement;
  component: SelectedElement;
  path: string;
}
