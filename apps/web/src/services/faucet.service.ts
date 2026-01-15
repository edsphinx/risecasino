/**
 * Faucet Service - All faucet contract read operations
 * Handles reading state from the CHIPFaucet smart contract.
 */

import { createPublicClient, http } from 'viem';
import { CHIP_FAUCET_ABI, CHIP_FAUCET_ADDRESS, riseTestnet } from '@/lib/faucet';

// Shared public client - created once
const publicClient = createPublicClient({
  chain: riseTestnet,
  transport: http(),
});

/**
 * Faucet status for a user
 */
export interface FaucetStatus {
  canClaim: boolean;
  timeUntilClaim: number;
  faucetBalance: bigint;
  amountPerClaim: bigint;
}

/**
 * Get faucet status for a user address
 */
async function getFaucetStatus(userAddress: `0x${string}`): Promise<FaucetStatus> {
  const [canClaim, timeUntil, balance, amount] = await Promise.all([
    publicClient.readContract({
      address: CHIP_FAUCET_ADDRESS,
      abi: CHIP_FAUCET_ABI,
      functionName: 'canClaim',
      args: [userAddress],
    }),
    publicClient.readContract({
      address: CHIP_FAUCET_ADDRESS,
      abi: CHIP_FAUCET_ABI,
      functionName: 'timeUntilClaim',
      args: [userAddress],
    }),
    publicClient.readContract({
      address: CHIP_FAUCET_ADDRESS,
      abi: CHIP_FAUCET_ABI,
      functionName: 'faucetBalance',
    }),
    publicClient.readContract({
      address: CHIP_FAUCET_ADDRESS,
      abi: CHIP_FAUCET_ABI,
      functionName: 'amountPerClaim',
    }),
  ]);

  return {
    canClaim: canClaim as boolean,
    timeUntilClaim: Number(timeUntil as bigint),
    faucetBalance: balance as bigint,
    amountPerClaim: amount as bigint,
  };
}

/**
 * Check if a user can claim from the faucet
 */
async function canUserClaim(userAddress: `0x${string}`): Promise<boolean> {
  try {
    const result = await publicClient.readContract({
      address: CHIP_FAUCET_ADDRESS,
      abi: CHIP_FAUCET_ABI,
      functionName: 'canClaim',
      args: [userAddress],
    });
    return result as boolean;
  } catch {
    return false;
  }
}

/**
 * Get the faucet balance
 */
async function getFaucetBalance(): Promise<bigint> {
  return publicClient.readContract({
    address: CHIP_FAUCET_ADDRESS,
    abi: CHIP_FAUCET_ABI,
    functionName: 'faucetBalance',
  }) as Promise<bigint>;
}

/**
 * Wait for a transaction to be confirmed
 */
async function waitForTransaction(hash: `0x${string}`): Promise<boolean> {
  try {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt.status === 'success';
  } catch {
    return false;
  }
}

/**
 * Send claim transaction using session key or passkey fallback
 * Follows the same pattern as useGameActions.ts
 */
async function sendClaimTransaction(address: `0x${string}`): Promise<`0x${string}` | null> {
  console.log('[FaucetService] Starting claim transaction for:', address);

  // Import dynamically to avoid circular dependencies
  const { getProvider } = await import('@/lib/riseWallet');
  const { signWithSessionKey, getActiveSessionKey } = await import('@/services/sessionKey.service');
  const { encodeFunctionData } = await import('viem');

  const provider = getProvider();
  const sessionKey = getActiveSessionKey();

  console.log('[FaucetService] Session key available:', !!sessionKey);
  if (sessionKey) {
    console.log(
      '[FaucetService] Session key publicKey:',
      sessionKey.publicKey?.slice(0, 30) + '...'
    );
  }

  const data = encodeFunctionData({
    abi: CHIP_FAUCET_ABI,
    functionName: 'claim',
  });
  console.log('[FaucetService] Encoded claim() data:', data);

  // If session key available, use it for gasless tx
  if (sessionKey) {
    try {
      const prepareParams = [
        {
          calls: [
            {
              to: CHIP_FAUCET_ADDRESS.toLowerCase() as `0x${string}`,
              value: '0x0' as `0x${string}`,
              data,
            },
          ],
          key: {
            type: 'p256',
            publicKey: sessionKey.publicKey,
          },
        },
      ];
      console.log('[FaucetService] Prepare params:', JSON.stringify(prepareParams, null, 2));

      console.log('[FaucetService] Calling wallet_prepareCalls...');
      const prepared = (await (provider as any).request({
        method: 'wallet_prepareCalls',
        params: prepareParams,
      })) as { digest: `0x${string}` };
      console.log('[FaucetService] Prepared response:', prepared);

      const { digest, ...requestParams } = prepared;
      console.log('[FaucetService] Signing digest:', digest);
      const signature = signWithSessionKey(digest, sessionKey);
      console.log('[FaucetService] Signature:', signature?.slice(0, 30) + '...');

      console.log('[FaucetService] Calling wallet_sendPreparedCalls...');
      const response = (await (provider as any).request({
        method: 'wallet_sendPreparedCalls',
        params: [{ ...requestParams, signature }],
      })) as Array<{ id: `0x${string}` }>;
      console.log('[FaucetService] Send response:', response);

      const callId = response[0]?.id;
      if (!callId) {
        throw new Error('No call ID returned');
      }
      console.log('[FaucetService] Call ID:', callId);

      // Get transaction status and hash using wallet_getCallsStatus
      // Following official wallet-demo pattern
      console.log('[FaucetService] Getting transaction status...');
      const status = (await (provider as any).request({
        method: 'wallet_getCallsStatus',
        params: [callId],
      })) as { status: number; receipts?: Array<{ transactionHash: string }> };
      console.log('[FaucetService] Status:', status);

      // Check for failure (status 500 means tx failed)
      if (status.status === 500) {
        throw new Error('Transaction failed with status 500');
      }

      const txHash = status.receipts?.[0]?.transactionHash as `0x${string}` | undefined;
      if (txHash) {
        console.log('[FaucetService] Got tx hash:', txHash);
        return txHash;
      }

      // If no receipts yet, return callId as optimistic ID
      console.log('[FaucetService] No receipts yet, returning callId');
      return callId;
    } catch (err) {
      console.error('[FaucetService] Session key FAILED:', err);
      console.warn('[FaucetService] Falling back to passkey...');
      // Fall through to passkey
    }
  }

  // Passkey fallback (shows popup)
  console.log('[FaucetService] Using passkey fallback...');
  const txHash = (await (provider as any).request({
    method: 'eth_sendTransaction',
    params: [
      {
        from: address,
        to: CHIP_FAUCET_ADDRESS,
        value: '0x0',
        data,
      },
    ],
  })) as `0x${string}`;

  console.log('[FaucetService] Passkey txHash:', txHash);
  return txHash;
}
/**
 * Get user's CHIP token balance
 * Used to check if user should be allowed to claim more from faucet
 */
async function getUserChipBalance(userAddress: `0x${string}`): Promise<bigint> {
  try {
    const { CHIP_TOKEN_ADDRESS } = await import('@/lib/faucet');
    const balance = await publicClient.readContract({
      address: CHIP_TOKEN_ADDRESS,
      abi: [
        {
          name: 'balanceOf',
          type: 'function',
          stateMutability: 'view',
          inputs: [{ name: 'account', type: 'address' }],
          outputs: [{ type: 'uint256' }],
        },
      ],
      functionName: 'balanceOf',
      args: [userAddress],
    });
    return balance as bigint;
  } catch (err) {
    console.error('[FaucetService] Failed to get user CHIP balance:', err);
    return 0n;
  }
}

export const FaucetService = {
  getFaucetStatus,
  canUserClaim,
  getFaucetBalance,
  getUserChipBalance,
  waitForTransaction,
  sendClaimTransaction,

  // Expose for advanced use cases
  publicClient,
  contractAddress: CHIP_FAUCET_ADDRESS,
} as const;
