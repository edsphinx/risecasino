/**
 * Error Service - Centralized error handling
 * Provides safe, user-friendly error messages without exposing internal details.
 */

// Map of known error patterns to safe user messages
const SAFE_ERROR_MESSAGES: Record<string, string> = {
  // User actions
  'user rejected': 'Transaction was cancelled',
  'user denied': 'Transaction was cancelled',
  rejected: 'Transaction was cancelled',
  cancelled: 'Transaction was cancelled',

  // Balance / approval
  'insufficient balance': 'Insufficient balance',
  'insufficient funds': 'Insufficient balance',
  'invalid bet amount': 'Invalid bet amount',

  // VyreJackCore contract errors
  'bet out of range': 'Bet amount is outside table limits',
  'game in progress': 'You already have an active game',
  'game not active': 'Game is currently paused',
  'not your turn': 'Cannot perform this action now',
  'can only double on initial hand': 'Can only double down on first two cards',
  'already doubled': 'Already doubled down',
  'can only surrender on initial hand': 'Can only surrender on first two cards',
  'no active game': 'No active game found',
  'vrf not timed out': 'Please wait for randomness to arrive',

  // Network
  'network error': 'Network error. Please try again.',
  timeout: 'Request timed out. Please try again.',
};

/**
 * Get a safe, user-friendly error message
 * @param error - The error to process
 * @returns A safe message that doesn't expose internal details
 */
function getSafeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  // Check for known safe messages
  for (const [pattern, safeMessage] of Object.entries(SAFE_ERROR_MESSAGES)) {
    if (lowerMessage.includes(pattern.toLowerCase())) {
      return safeMessage;
    }
  }

  // Generic fallback - never expose internal details
  return 'Transaction failed. Please try again.';
}

/**
 * Check if an error represents a user rejection/cancellation
 * @param error - The error to check
 * @returns true if the user cancelled the action
 */
function isUserRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  return (
    lowerMessage.includes('rejected') ||
    lowerMessage.includes('cancelled') ||
    lowerMessage.includes('denied') ||
    lowerMessage.includes('user rejected')
  );
}

/**
 * Create a typed error with a safe message
 */
function createSafeError(error: unknown): Error {
  return new Error(getSafeMessage(error));
}

export const ErrorService = {
  getSafeMessage,
  isUserRejection,
  createSafeError,
} as const;
