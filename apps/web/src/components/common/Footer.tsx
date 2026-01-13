/**
 * Footer - Casino footer with important links and legal information
 */

import { Logo } from '@/components/brand/Logo';
import { VYRECASINO_ADDRESS } from '@/lib/contract';

export function Footer() {
  const currentYear = new Date().getFullYear();
  const explorerUrl = `https://explorer.testnet.riselabs.xyz/address/${VYRECASINO_ADDRESS}`;
  const shortAddress = `${VYRECASINO_ADDRESS.slice(0, 6)}...verified`;

  return (
    <footer className="casino-footer">
      <div className="footer-content">
        {/* Brand & Description */}
        <div className="footer-brand">
          <Logo variant="vyrecasino" className="footer-logo" />
          <p>
            Provably fair on-chain gaming powered by Rise Chain. 10ms blocks, instant payouts,
            transparent odds.
          </p>
          <div className="footer-social">
            <a
              href="https://twitter.com/vyrecasino"
              target="_blank"
              rel="noopener noreferrer"
              title="Twitter"
            >
              𝕏
            </a>
            <a
              href="https://github.com/edsphinx/vyrejack"
              target="_blank"
              rel="noopener noreferrer"
              title="GitHub"
            >
              ⌨️
            </a>
            <a
              href="https://discord.gg/risechain"
              target="_blank"
              rel="noopener noreferrer"
              title="Discord"
            >
              💬
            </a>
          </div>
        </div>

        {/* Rise Chain */}
        <div className="footer-section">
          <h4>Rise Chain</h4>
          <ul>
            <li>
              <a href="https://riselabs.xyz" target="_blank" rel="noopener noreferrer">
                Rise Labs
              </a>
            </li>
            <li>
              <a href="https://docs.riselabs.xyz" target="_blank" rel="noopener noreferrer">
                Documentation
              </a>
            </li>
            <li>
              <a
                href="https://testnet.explorer.riselabs.xyz"
                target="_blank"
                rel="noopener noreferrer"
              >
                Block Explorer
              </a>
            </li>
            <li>
              <a href="https://testnet.riselabs.xyz" target="_blank" rel="noopener noreferrer">
                Testnet Faucet
              </a>
            </li>
          </ul>
        </div>

        {/* Resources */}
        <div className="footer-section">
          <h4>Resources</h4>
          <ul>
            <li>
              <a
                href="https://github.com/edsphinx/vyrejack"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub Repo
              </a>
            </li>
            <li>
              <a href="/leaderboard">Leaderboard</a>
            </li>
            <li>
              <a href="#provably-fair">Provably Fair</a>
            </li>
            <li>
              <a href="#how-to-play">How to Play</a>
            </li>
          </ul>
        </div>

        {/* Legal */}
        <div className="footer-section">
          <h4>Legal</h4>
          <ul>
            <li>
              <a href="#terms">Terms of Service</a>
            </li>
            <li>
              <a href="#privacy">Privacy Policy</a>
            </li>
            <li>
              <a href="#responsible-gaming">Responsible Gaming</a>
            </li>
            <li>
              <a href="#aml-policy">AML Policy</a>
            </li>
          </ul>
        </div>
      </div>

      {/* Responsible Gaming Banner */}
      <div className="footer-responsible">
        <span className="age-badge">18+</span>
        <p>
          Gambling can be addictive. Play responsibly. Only gamble with funds you can afford to
          lose.
        </p>
      </div>

      {/* Copyright & Contract */}
      <div className="footer-bottom">
        <p>© {currentYear} VyreCasino. All rights reserved.</p>
        <p className="contract-info">
          VyreCasino:{' '}
          <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
            {shortAddress}
          </a>
        </p>
        <p className="powered-by">
          Powered by{' '}
          <a href="https://riselabs.xyz" target="_blank" rel="noopener noreferrer">
            Rise Chain
          </a>
        </p>
      </div>
    </footer>
  );
}
