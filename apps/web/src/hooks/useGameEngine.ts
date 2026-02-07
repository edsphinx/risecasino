/**
 * useGameEngine - Bridge hook for GameEngine integration with Preact
 *
 * Connects the vanilla TypeScript GameEngine to Preact components.
 * Handles mount/unmount lifecycle, state subscriptions, and provides stable action refs.
 *
 * When playerAddress is provided, automatically connects to WebSocket/Shreds
 * and maps VyreJackCore events to GameEngine methods.
 *
 * ⚠️ STRICT TYPING: No `any` types allowed.
 */

import { useRef, useEffect, useCallback, useState } from 'preact/hooks';
import { GameEngine } from '../lib/game-engine/GameEngine';
import {
  useGameEvents,
  type CardDealtEvent,
  type GameResolvedEvent,
  type BustedEvent,
  type CardRevealedEvent,
} from './useGameEvents';
import type {
  GamePhase,
  CardIndex,
  EngineGameResult,
  EngineGameState,
} from '../lib/game-engine/types';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Options for useGameEngine hook
 */
export interface UseGameEngineOptions {
  /** Player address - when provided, auto-connects to WebSocket/Shreds events */
  playerAddress?: `0x${string}` | null;
  /** Callback when phase changes */
  onPhaseChange?: (phase: GamePhase) => void;
  /** Callback when game ends */
  onGameEnd?: (result: EngineGameResult) => void;
}

/**
 * State container that mimics signal interface for consistent API
 */
interface StateValue<T> {
  value: T;
}

/**
 * Return type for useGameEngine hook
 */
export interface UseGameEngineReturn {
  // Reactive state (signal-like interface for consistency)
  phase: StateValue<GamePhase>;
  playerCards: StateValue<CardIndex[]>;
  dealerCards: StateValue<CardIndex[]>;
  isReady: StateValue<boolean>;
  /** WebSocket/Shreds connection status (only when playerAddress provided) */
  isEventConnected: StateValue<boolean>;

  // Actions (stable callbacks)
  startGame: () => void;
  dealCard: (cardIndex: CardIndex, isDealer: boolean, isHidden: boolean) => void;
  setPlayerTurn: () => void;
  setDealerTurn: () => void;
  revealHiddenCard: () => void;
  endGame: (result: EngineGameResult) => void;
  animateBust: (isDealer: boolean) => void;
  reset: () => void;
}

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

/**
 * Hook that bridges GameEngine to Preact components
 *
 * @param containerId - DOM element ID for the game container
 * @param options - Optional callbacks and playerAddress for WebSocket integration
 * @returns Hook return object with state and actions
 */
export function useGameEngine(
  containerId: string,
  options: UseGameEngineOptions = {}
): UseGameEngineReturn {
  // Engine ref - lives outside render cycle
  const engineRef = useRef<GameEngine | null>(null);
  const unsubscribeRef = useRef<Array<() => void>>([]);

  // State using useState
  const [phase, setPhase] = useState<GamePhase>('idle');
  const [playerCards, setPlayerCards] = useState<CardIndex[]>([]);
  const [dealerCards, setDealerCards] = useState<CardIndex[]>([]);
  const [isReady, setIsReady] = useState<boolean>(false);

  // Store options in ref to avoid effect dependencies changing
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Initialize engine on mount
  useEffect(() => {
    // Check if container exists
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`[useGameEngine] Container not found: ${containerId}`);
      setIsReady(false);
      return;
    }

    // Create engine
    const engine = new GameEngine({ containerId });
    engineRef.current = engine;
    setIsReady(true);

    // Subscribe to state changes
    const stateUnsubscribe = engine.onStateChange((state: EngineGameState) => {
      setPhase(state.phase);
      setPlayerCards([...state.playerCards]);
      setDealerCards([...state.dealerCards]);
    });
    unsubscribeRef.current.push(stateUnsubscribe);

    // Subscribe to phase changes for callback
    const phaseUnsubscribe = engine.onPhaseChange((p: GamePhase) => {
      optionsRef.current.onPhaseChange?.(p);
    });
    unsubscribeRef.current.push(phaseUnsubscribe);

    // Subscribe to game end for callback
    const endUnsubscribe = engine.onGameEnd((result: EngineGameResult) => {
      optionsRef.current.onGameEnd?.(result);
    });
    unsubscribeRef.current.push(endUnsubscribe);

    // Cleanup on unmount
    return () => {
      // Unsubscribe from all listeners
      unsubscribeRef.current.forEach((unsub) => unsub());
      unsubscribeRef.current = [];

      // Destroy engine
      engine.destroy();
      engineRef.current = null;

      // Reset state
      setIsReady(false);
      setPhase('idle');
      setPlayerCards([]);
      setDealerCards([]);
    };
  }, [containerId]);

  // =========================================================================
  // WEBSOCKET/SHREDS EVENT INTEGRATION
  // =========================================================================

  // Event handlers that map WebSocket events to GameEngine methods
  const handleCardDealt = useCallback((event: CardDealtEvent) => {
    engineRef.current?.dealCard(event.card, event.isDealer, !event.faceUp);
  }, []);

  const handleGameResolved = useCallback((event: GameResolvedEvent) => {
    if (event.result) {
      engineRef.current?.endGame(event.result as EngineGameResult);
    }
  }, []);

  const handlePlayerBusted = useCallback((_event: BustedEvent) => {
    engineRef.current?.animateBust(false);
  }, []);

  const handleDealerBusted = useCallback((_event: BustedEvent) => {
    engineRef.current?.animateBust(true);
  }, []);

  const handleDealerCardRevealed = useCallback((_event: CardRevealedEvent) => {
    engineRef.current?.revealHiddenCard();
  }, []);

  // Connect to WebSocket events when playerAddress is provided
  const { isConnected: isEventConnected } = useGameEvents(options.playerAddress ?? null, {
    onGameResolved: handleGameResolved,
    onCardDealt: handleCardDealt,
    onPlayerBusted: handlePlayerBusted,
    onDealerBusted: handleDealerBusted,
    onDealerCardRevealed: handleDealerCardRevealed,
  });

  // =========================================================================
  // STABLE ACTION CALLBACKS
  // =========================================================================

  const startGame = useCallback(() => {
    engineRef.current?.startGame();
  }, []);

  const dealCard = useCallback((cardIndex: CardIndex, isDealer: boolean, isHidden: boolean) => {
    engineRef.current?.dealCard(cardIndex, isDealer, isHidden);
  }, []);

  const setPlayerTurn = useCallback(() => {
    engineRef.current?.setPlayerTurn();
  }, []);

  const setDealerTurn = useCallback(() => {
    engineRef.current?.setDealerTurn();
  }, []);

  const revealHiddenCard = useCallback(() => {
    engineRef.current?.revealHiddenCard();
  }, []);

  const endGame = useCallback((result: EngineGameResult) => {
    engineRef.current?.endGame(result);
  }, []);

  const animateBust = useCallback((isDealer: boolean) => {
    engineRef.current?.animateBust(isDealer);
  }, []);

  const reset = useCallback(() => {
    engineRef.current?.reset();
  }, []);

  // Return with signal-like interface for API consistency
  return {
    // State (wrapped in value objects for signal-like API)
    phase: { value: phase },
    playerCards: { value: playerCards },
    dealerCards: { value: dealerCards },
    isReady: { value: isReady },
    isEventConnected: { value: isEventConnected },

    // Actions
    startGame,
    dealCard,
    setPlayerTurn,
    setDealerTurn,
    revealHiddenCard,
    endGame,
    animateBust,
    reset,
  };
}
