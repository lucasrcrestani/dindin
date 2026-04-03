import { getCredentials } from './driveService.js';

let _pickerReady = false;

/**
 * Loads the Google Picker library via gapi.
 * Called by window.onGapiLoad, but also invoked lazily if needed.
 */
function loadPickerApi() {
  if (_pickerReady) return Promise.resolve();
  return new Promise((resolve) => {
    window.gapi.load('picker', () => {
      _pickerReady = true;
      resolve();
    });
  });
}

/**
 * Ensures gapi and the Picker library are ready.
 * Waits up to 10 s for api.js to finish loading, then loads the picker module.
 */
function _ensurePickerReady() {
  if (_pickerReady) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      clearInterval(check);
      reject(new Error('Google API não carregou. Verifique sua conexão e recarregue a página.'));
    }, 10_000);

    const check = setInterval(async () => {
      if (window.gapi) {
        clearInterval(check);
        clearTimeout(timer);
        try {
          await loadPickerApi();
          resolve();
        } catch (err) {
          reject(err);
        }
      }
    }, 100);
  });
}

/**
 * Opens the Google Picker in JSON-file mode.
 * Resolves with { id, name } when the user selects a file.
 *
 * @param {string} accessToken - A valid OAuth 2.0 access token.
 * @returns {Promise<{ id: string, name: string }>}
 */
async function openFilePicker(accessToken) {
  await _ensurePickerReady();
  const creds = getCredentials();
  if (!creds) throw new Error('Credenciais do Google não configuradas.');

  return new Promise((resolve, reject) => {
    const view = new window.google.picker.DocsView()
      .setMimeTypes('application/json')
      .setMode(window.google.picker.DocsViewMode.LIST);

    const picker = new window.google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(creds.apiKey)
      .setAppId(creds.appId)
      .setCallback((data) => {
        const { Response, Action, Document } = window.google.picker;
        if (data[Response.ACTION] === Action.PICKED) {
          const doc = data[Response.DOCUMENTS][0];
          resolve({ id: doc[Document.ID], name: doc[Document.NAME] });
        } else if (data[Response.ACTION] === Action.CANCEL) {
          reject(new Error('Seleção cancelada pelo usuário.'));
        }
      })
      .build();

    picker.setVisible(true);
  });
}

export { loadPickerApi, openFilePicker };
