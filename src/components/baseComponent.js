/**
 * BaseComponent — Web Component base class for DinDin custom elements.
 * Utilizes open Shadow DOM and adopts project global stylesheets.
 */
const BaseHTMLElement = typeof HTMLElement === 'undefined' ? class {} : HTMLElement;

export class BaseComponent extends BaseHTMLElement {
  constructor() {
    super();
    if (typeof this.attachShadow === 'function') {
      this.attachShadow({ mode: 'open' });
    }
    this._data = {};
    this._stylesLoaded = false;
    this._contentRoot = document.createElement('div');
    this._contentRoot.className = 'component-root';
  }

  connectedCallback() {
    if (!this.shadowRoot) return;
    this._injectStyles();
    if (!this.shadowRoot.contains(this._contentRoot)) {
      this.shadowRoot.appendChild(this._contentRoot);
    }
    this.render();
  }

  disconnectedCallback() {
    // Override in subclasses if cleanup of global event listeners or timers is needed
  }

  _injectStyles() {
    if (this._stylesLoaded || !this.shadowRoot) return;

    // In modern browsers, we can use adoptedStyleSheets or create link elements
    // Since we are running in browser and test environments (like jsdom/playwright),
    // injecting <link> tags into the shadow root ensures universal compatibility with global css.
    const cssPaths = [
      'assets/css/components.css',
      'assets/css/main.css',
      'assets/css/responsive.css'
    ];

    cssPaths.forEach((path) => {
      // Avoid duplicate links if already present
      if (!this.shadowRoot.querySelector(`link[href*="${path}"]`)) {
        const link = document.createElement('link');
        link.setAttribute('rel', 'stylesheet');
        // Handle relative paths when loaded from different contexts
        link.setAttribute('href', path);
        this.shadowRoot.prepend(link);
      }
    });

    this._stylesLoaded = true;
  }

  get contentRoot() {
    return this._contentRoot;
  }

  replaceContent(...nodes) {
    this._contentRoot.replaceChildren(...nodes);
  }

  get data() {
    return this._data;
  }

  set data(newVal) {
    this._data = { ...this._data, ...newVal };
    if (this.isConnected) {
      this.render();
    }
  }

  /**
   * Helper method to emit custom events that bubble through Shadow DOM boundaries.
   * @param {string} eventName 
   * @param {any} detail 
   */
  emitEvent(eventName, detail = {}) {
    this.dispatchEvent(new CustomEvent(eventName, {
      detail,
      bubbles: true,
      composed: true
    }));
  }

  /**
   * Subclasses must implement render() to populate this.shadowRoot.
   */
  render() {
    // To be implemented by subclasses
  }
}
