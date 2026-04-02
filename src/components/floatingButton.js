/**
 * Creates and appends the floating "+" button to the document body.
 * @param {{ onAdd: () => void }} callbacks
 * @returns {{ destroy: () => void }}
 */
function renderFloatingButton({ onAdd }) {
  const existing = document.getElementById('fab');
  if (existing) existing.remove();

  const btn = document.createElement('button');
  btn.id = 'fab';
  btn.className = 'fab';
  btn.setAttribute('aria-label', 'Adicionar');
  btn.textContent = '+';
  btn.addEventListener('click', onAdd);
  document.body.appendChild(btn);

  return {
    destroy() {
      btn.remove();
    },
  };
}

export { renderFloatingButton };
