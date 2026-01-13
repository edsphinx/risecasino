/**
 * XPPopup - Animated XP feedback popup
 * Shows "+XX XP" after game events to provide instant gratification
 */

import { useState, useEffect } from 'preact/hooks';

interface XPPopupProps {
    xpAmount: number | null;
    onComplete?: () => void;
}

export function XPPopup({ xpAmount, onComplete }: XPPopupProps) {
    const [visible, setVisible] = useState(false);
    const [displayAmount, setDisplayAmount] = useState(0);

    useEffect(() => {
        if (xpAmount && xpAmount > 0) {
            setDisplayAmount(xpAmount);
            setVisible(true);

            // Hide after animation completes
            const timer = setTimeout(() => {
                setVisible(false);
                onComplete?.();
            }, 2000);

            return () => clearTimeout(timer);
        }
    }, [xpAmount, onComplete]);

    if (!visible) return null;

    return (
        <div className="xp-popup">
            <div className="xp-popup-content">
                <span className="xp-icon">⭐</span>
                <span className="xp-amount">+{displayAmount} XP</span>
            </div>
        </div>
    );
}

/**
 * XP Progress Bar - Shows current XP and level progress
 */
interface XPProgressBarProps {
    currentXP: number;
    level: number;
    className?: string;
}

// XP thresholds per level (simplified version)
const getXPForLevel = (level: number) => level * 100;

export function XPProgressBar({ currentXP, level, className = '' }: XPProgressBarProps) {
    const currentLevelXP = getXPForLevel(level);
    const nextLevelXP = getXPForLevel(level + 1);
    const progressInLevel = currentXP - currentLevelXP;
    const xpNeeded = nextLevelXP - currentLevelXP;
    const progress = Math.min(100, (progressInLevel / xpNeeded) * 100);

    return (
        <div className={`xp-progress-bar ${className}`}>
            <div className="xp-progress-info">
                <span className="xp-level">Lv.{level}</span>
                <span className="xp-current">{currentXP.toLocaleString()} XP</span>
            </div>
            <div className="xp-bar-track">
                <div className="xp-bar-fill" style={{ width: `${progress}%` }} />
            </div>
        </div>
    );
}
