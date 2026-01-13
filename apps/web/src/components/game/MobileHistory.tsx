/**
 * MobileHistory - Compact horizontal history for mobile
 * Shows last 3 game results in a single row
 */

import { StorageService, type GameHistoryEntry } from '@/services/storage.service';
import { useState, useEffect } from 'preact/hooks';

export function MobileHistory() {
    const [history, setHistory] = useState<GameHistoryEntry[]>([]);

    useEffect(() => {
        // Load history on mount
        setHistory(StorageService.getGameHistory().slice(0, 3));

        // Refresh when storage changes
        const handleStorage = () => {
            setHistory(StorageService.getGameHistory().slice(0, 3));
        };

        window.addEventListener('storage', handleStorage);

        // Poll for changes (same tab updates don't trigger storage event)
        const interval = setInterval(() => {
            setHistory(StorageService.getGameHistory().slice(0, 3));
        }, 2000);

        return () => {
            window.removeEventListener('storage', handleStorage);
            clearInterval(interval);
        };
    }, []);

    if (history.length === 0) {
        return (
            <div className="mobile-history">
                <span className="mobile-history-label">History</span>
                <span className="mobile-history-empty">No games yet</span>
            </div>
        );
    }

    return (
        <div className="mobile-history">
            <span className="mobile-history-label">Recent</span>
            <div className="mobile-history-items">
                {history.map((item, index) => (
                    <MobileHistoryItem key={`${item.timestamp}-${index}`} item={item} />
                ))}
            </div>
        </div>
    );
}

function MobileHistoryItem({ item }: { item: GameHistoryEntry }) {
    const getIcon = () => {
        switch (item.result) {
            case 'win':
            case 'blackjack':
                return '🏆';
            case 'lose':
                return '❌';
            case 'push':
                return '🤝';
            default:
                return '•';
        }
    };

    const getClass = () => {
        switch (item.result) {
            case 'win':
            case 'blackjack':
                return 'history-win';
            case 'lose':
                return 'history-lose';
            case 'push':
                return 'history-push';
            default:
                return '';
        }
    };

    return (
        <div className={`mobile-history-item ${getClass()}`} title={`${item.result} - ${item.bet} ETH`}>
            <span className="history-icon">{getIcon()}</span>
        </div>
    );
}
