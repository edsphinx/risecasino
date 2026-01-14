/**
 * Admin - Session Key Management Page
 * Access restricted to admin address: 0x062FCBbE1CA8FC6d79D9a650d8022412d53B08F6
 */

import { useState, useEffect } from 'preact/hooks';
import { useWallet } from '@/context/WalletContext';
import { getProvider } from '@/lib/riseWallet';
import { revokeAllRemoteSessionKeys, getActiveSessionKey } from '@/services/sessionKeyManager';
import { logger } from '@/lib/logger';
import { Footer } from '@/components/common/Footer';

// Admin addresses that can access this page
const ADMIN_ADDRESSES = ['0x062FCBbE1CA8FC6d79D9a650d8022412d53B08F6'.toLowerCase()];

interface RemoteKey {
  publicKey: string;
  expiry: string;
  role: string;
  type: string;
  permissions?: any[];
  hash?: string;
}

export function Admin() {
  const wallet = useWallet();
  const [remoteKeys, setRemoteKeys] = useState<RemoteKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [message, setMessage] = useState('');
  const [localKey, setLocalKey] = useState<any>(null);

  const isAdmin =
    wallet.isConnected && wallet.address && ADMIN_ADDRESSES.includes(wallet.address.toLowerCase());

  // Fetch remote keys from relay
  const fetchRemoteKeys = async () => {
    if (!wallet.address) return;

    setLoading(true);
    try {
      const provider = getProvider();
      if (!provider) throw new Error('Provider not available');

      const response = await (provider as any).request({
        method: 'wallet_getKeys',
        params: [{ address: wallet.address }],
      });

      const chainId = '0xaa39db';
      const keys = response?.[chainId] || [];
      setRemoteKeys(keys);

      // Get local key
      const local = getActiveSessionKey(wallet.address);
      setLocalKey(local);

      setMessage(`Found ${keys.length} keys in relay`);
    } catch (err: any) {
      logger.error('Failed to fetch keys:', err);
      setMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Revoke all non-admin keys
  const handleRevokeAll = async () => {
    if (!wallet.address) return;

    setRevoking(true);
    setMessage('Revoking all session keys...');

    try {
      const result = await revokeAllRemoteSessionKeys(wallet.address);
      setMessage(`✅ Revoked ${result.revoked} keys, ${result.failed} failed`);
      await fetchRemoteKeys(); // Refresh
    } catch (err: any) {
      setMessage(`❌ Error: ${err.message}`);
    } finally {
      setRevoking(false);
    }
  };

  // Revoke single key
  const handleRevokeSingle = async (publicKey: string) => {
    if (!wallet.address) return;

    try {
      const provider = getProvider();
      if (!provider) throw new Error('Provider not available');

      await (provider as any).request({
        method: 'wallet_revokePermissions',
        params: [{ address: wallet.address, id: publicKey }],
      });

      setMessage(`✅ Revoked key: ${publicKey.slice(0, 20)}...`);
      await fetchRemoteKeys();
    } catch (err: any) {
      setMessage(`❌ Error: ${err.message}`);
    }
  };

  // Fetch on mount when connected
  useEffect(() => {
    if (isAdmin) {
      fetchRemoteKeys();
    }
  }, [wallet.address, wallet.isConnected]);

  // Not connected
  if (!wallet.isConnected) {
    return (
      <div className="admin-page">
        <div className="admin-container">
          <h1>🔒 Admin Panel</h1>
          <p>Connect your wallet to access admin features.</p>
          <button className="admin-btn" onClick={wallet.connect}>
            Connect Wallet
          </button>
        </div>
        <Footer />
      </div>
    );
  }

  // Not admin
  if (!isAdmin) {
    return (
      <div className="admin-page">
        <div className="admin-container">
          <h1>⛔ Access Denied</h1>
          <p>Your address is not authorized to access this page.</p>
          <p className="admin-address">Connected: {wallet.address}</p>
        </div>
        <Footer />
      </div>
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const sessionKeys = remoteKeys.filter((k) => k.role !== 'admin');
  const adminKeys = remoteKeys.filter((k) => k.role === 'admin');
  const activeKeys = sessionKeys.filter((k) => parseInt(k.expiry, 16) > now);
  const expiredKeys = sessionKeys.filter((k) => parseInt(k.expiry, 16) <= now);

  return (
    <div className="admin-page">
      <div className="admin-container">
        <h1>🔧 Admin Panel - Session Key Management</h1>
        <p className="admin-address">Connected: {wallet.address}</p>

        {/* Stats */}
        <div className="admin-stats">
          <div className="stat-card">
            <span className="stat-value">{remoteKeys.length}</span>
            <span className="stat-label">Total Keys</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{adminKeys.length}</span>
            <span className="stat-label">Admin Keys</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{activeKeys.length}</span>
            <span className="stat-label">Active Session</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{expiredKeys.length}</span>
            <span className="stat-label">Expired</span>
          </div>
        </div>

        {/* Actions */}
        <div className="admin-actions">
          <button className="admin-btn" onClick={fetchRemoteKeys} disabled={loading}>
            {loading ? '⏳ Loading...' : '🔄 Refresh Keys'}
          </button>
          <button
            className="admin-btn admin-btn-danger"
            onClick={handleRevokeAll}
            disabled={revoking || sessionKeys.length === 0}
          >
            {revoking ? '⏳ Revoking...' : `🗑️ Revoke All Session Keys (${sessionKeys.length})`}
          </button>
        </div>

        {/* Message */}
        {message && <div className="admin-message">{message}</div>}

        {/* Local Key Info */}
        <div className="admin-section">
          <h2>📦 Local Storage Key</h2>
          {localKey ? (
            <div className="key-card key-card-local">
              <p>
                <strong>Public Key:</strong> {localKey.publicKey?.slice(0, 30)}...
              </p>
              <p>
                <strong>Expires:</strong> {new Date(localKey.expiry * 1000).toLocaleString()}
              </p>
              <p>
                <strong>Context:</strong> {localKey.context || 'N/A'}
              </p>
            </div>
          ) : (
            <p className="no-keys">No local session key found.</p>
          )}
        </div>

        {/* Session Keys List */}
        <div className="admin-section">
          <h2>🔑 Remote Session Keys ({sessionKeys.length})</h2>
          {sessionKeys.length === 0 ? (
            <p className="no-keys">No session keys in relay.</p>
          ) : (
            <div className="keys-list">
              {sessionKeys.map((key, idx) => {
                const expiry = parseInt(key.expiry, 16);
                const isExpired = expiry <= now;
                const isLocal = localKey?.publicKey?.toLowerCase() === key.publicKey?.toLowerCase();

                return (
                  <div
                    key={key.publicKey || idx}
                    className={`key-card ${isExpired ? 'expired' : ''} ${isLocal ? 'local' : ''}`}
                  >
                    <div className="key-header">
                      <span className="key-idx">#{idx + 1}</span>
                      {isLocal && <span className="key-badge local">LOCAL</span>}
                      {isExpired && <span className="key-badge expired">EXPIRED</span>}
                      {!isExpired && !isLocal && <span className="key-badge orphan">ORPHAN</span>}
                    </div>
                    <p className="key-pubkey">{key.publicKey?.slice(0, 40)}...</p>
                    <p className="key-expiry">
                      Expires: {new Date(expiry * 1000).toLocaleString()}
                    </p>
                    {key.permissions && (
                      <p className="key-permissions">{key.permissions.length} permissions</p>
                    )}
                    {!isExpired && (
                      <button
                        className="key-revoke-btn"
                        onClick={() => handleRevokeSingle(key.publicKey)}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .admin-page {
          min-height: 100vh;
          background: #0a0a0f;
          color: #fff;
          padding: 2rem;
        }
        .admin-container {
          max-width: 1200px;
          margin: 0 auto;
        }
        .admin-container h1 {
          font-size: 2rem;
          margin-bottom: 0.5rem;
        }
        .admin-address {
          color: #888;
          font-family: monospace;
          margin-bottom: 2rem;
        }
        .admin-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1rem;
          margin-bottom: 2rem;
        }
        .stat-card {
          background: #1a1a2e;
          border-radius: 12px;
          padding: 1.5rem;
          text-align: center;
          border: 1px solid #333;
        }
        .stat-value {
          display: block;
          font-size: 2.5rem;
          font-weight: bold;
          color: #00ff88;
        }
        .stat-label {
          color: #888;
          font-size: 0.875rem;
        }
        .admin-actions {
          display: flex;
          gap: 1rem;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
        }
        .admin-btn {
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          border: none;
          background: #333;
          color: #fff;
          cursor: pointer;
          font-size: 1rem;
        }
        .admin-btn:hover:not(:disabled) {
          background: #444;
        }
        .admin-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .admin-btn-danger {
          background: #b91c1c;
        }
        .admin-btn-danger:hover:not(:disabled) {
          background: #dc2626;
        }
        .admin-message {
          padding: 1rem;
          background: #1a1a2e;
          border-radius: 8px;
          margin-bottom: 1.5rem;
          font-family: monospace;
        }
        .admin-section {
          margin-bottom: 2rem;
        }
        .admin-section h2 {
          font-size: 1.25rem;
          margin-bottom: 1rem;
          color: #ccc;
        }
        .no-keys {
          color: #666;
          font-style: italic;
        }
        .keys-list {
          display: grid;
          gap: 1rem;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        }
        .key-card {
          background: #1a1a2e;
          border: 1px solid #333;
          border-radius: 12px;
          padding: 1rem;
        }
        .key-card.expired {
          opacity: 0.5;
          border-color: #666;
        }
        .key-card.local {
          border-color: #00ff88;
          box-shadow: 0 0 10px rgba(0, 255, 136, 0.2);
        }
        .key-card-local {
          border-color: #00ff88;
          background: #1a2e1a;
        }
        .key-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }
        .key-idx {
          font-weight: bold;
          color: #888;
        }
        .key-badge {
          padding: 0.125rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: bold;
        }
        .key-badge.local {
          background: #00ff88;
          color: #000;
        }
        .key-badge.expired {
          background: #666;
          color: #fff;
        }
        .key-badge.orphan {
          background: #f59e0b;
          color: #000;
        }
        .key-pubkey {
          font-family: monospace;
          font-size: 0.75rem;
          color: #aaa;
          word-break: break-all;
        }
        .key-expiry {
          font-size: 0.875rem;
          color: #888;
        }
        .key-permissions {
          font-size: 0.75rem;
          color: #666;
        }
        .key-revoke-btn {
          margin-top: 0.5rem;
          padding: 0.5rem 1rem;
          background: #b91c1c;
          border: none;
          border-radius: 6px;
          color: #fff;
          cursor: pointer;
          font-size: 0.875rem;
        }
        .key-revoke-btn:hover {
          background: #dc2626;
        }
      `}</style>

      <Footer />
    </div>
  );
}

export default Admin;
