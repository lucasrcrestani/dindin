import { BaseComponent } from './baseComponent.js';

class DindinFloatingButton extends BaseComponent {
  render() {
    const { onAdd } = this.data;
    this.id = 'fab';
    this.className = 'fab';
    this.setAttribute('aria-label', 'Adicionar');
    this.setAttribute('role', 'button');
    this.tabIndex = 0;
    this.onclick = () => {
      if (onAdd) onAdd();
    };

    const label = document.createElement('span');
    label.textContent = '+';
    label.setAttribute('aria-hidden', 'true');

    this.replaceContent(label);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('dindin-floating-button')) {
  customElements.define('dindin-floating-button', DindinFloatingButton);
}

/**
 * Creates and appends the floating "+" button to the document body.
 * @param {{ onAdd: () => void }} callbacks
 * @returns {{ destroy: () => void }}
 */
function renderFloatingButton({ onAdd }) {
  const existing = document.getElementById('fab');
  if (existing) existing.remove();

  const element = document.createElement('dindin-floating-button');
  element.data = { onAdd };
  document.body.appendChild(element);

  return {
    destroy() {
      element.remove();
    },
  };
}

export { renderFloatingButton };
