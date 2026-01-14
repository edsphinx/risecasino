// WebAuthn polyfill must be loaded first (CSP-compliant external file)
import './lib/webauthn-polyfill';

import { render } from 'preact';
import { App } from './app';
import './styles/globals.scss';
import { checkPendingDbDelete } from './lib/walletRecovery';

// Complete any pending IndexedDB cleanup from recovery modal
checkPendingDbDelete().then(() => {
  render(<App />, document.getElementById('app')!);
});
