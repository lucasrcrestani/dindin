// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import '../src/components/addCategoryModal.js';

describe('modal overlays', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('does not close when clicking inside the modal content', async () => {
    const modal = document.createElement('dindin-add-category-modal');
    document.body.appendChild(modal);

    await Promise.resolve();

    const input = modal.shadowRoot.querySelector('#cat-name');
    input.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(modal.classList.contains('modal-overlay--visible')).toBe(true);
  });
});
