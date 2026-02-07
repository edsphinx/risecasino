/**
 * Permit2 Service
 * Utilities for signing Permit2 transfer permits for gasless token approvals
 *
 * Permit2 is pre-deployed on Rise Testnet at:
 * 0x000000000022D473030F116dDEE9F6B43aC78BA3
 */

import {
  keccak256,
  encodePacked,
  encodeAbiParameters,
  parseAbiParameters,
  type Address,
} from 'viem';
import { signWithSessionKey, type SessionKeyData } from './sessionKey.service';
import { logger } from '@/lib/logger';

// Permit2 contract address (same on all Rise chains)
export const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address;

// EIP-712 Domain for Permit2
const PERMIT2_DOMAIN = {
  name: 'Permit2',
  chainId: 11155931, // Rise Testnet
  verifyingContract: PERMIT2_ADDRESS,
};

// TypeHash for PermitTransferFrom
// keccak256("PermitTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)")
const PERMIT_TRANSFER_FROM_TYPEHASH = keccak256(
  encodePacked(
    ['string'],
    [
      'PermitTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)',
    ]
  )
);

// TypeHash for TokenPermissions
// keccak256("TokenPermissions(address token,uint256 amount)")
const TOKEN_PERMISSIONS_TYPEHASH = keccak256(
  encodePacked(['string'], ['TokenPermissions(address token,uint256 amount)'])
);

// Domain separator for EIP-712
const DOMAIN_SEPARATOR = keccak256(
  encodeAbiParameters(parseAbiParameters('bytes32, bytes32, uint256, address'), [
    keccak256(
      encodePacked(
        ['string'],
        ['EIP712Domain(string name,uint256 chainId,address verifyingContract)']
      )
    ),
    keccak256(encodePacked(['string'], [PERMIT2_DOMAIN.name])),
    BigInt(PERMIT2_DOMAIN.chainId),
    PERMIT2_DOMAIN.verifyingContract,
  ])
);

export interface PermitTransferFrom {
  permitted: {
    token: Address;
    amount: bigint;
  };
  nonce: bigint;
  deadline: bigint;
}

export interface SignedPermit {
  permit: PermitTransferFrom;
  signature: `0x${string}`;
}

// Nonce management - uses random nonces to avoid conflicts
let nonceCounter = BigInt(Date.now()) * BigInt(1000000);

/**
 * Generate a unique nonce for Permit2
 * Using random nonces instead of sequential to avoid conflicts
 */
export function generateNonce(): bigint {
  nonceCounter += BigInt(1);
  return nonceCounter;
}

/**
 * Create the hash of TokenPermissions struct
 */
function hashTokenPermissions(token: Address, amount: bigint): `0x${string}` {
  return keccak256(
    encodeAbiParameters(parseAbiParameters('bytes32, address, uint256'), [
      TOKEN_PERMISSIONS_TYPEHASH,
      token,
      amount,
    ])
  );
}

/**
 * Create the hash of PermitTransferFrom struct
 */
function hashPermitTransferFrom(permit: PermitTransferFrom, spender: Address): `0x${string}` {
  const tokenPermissionsHash = hashTokenPermissions(
    permit.permitted.token,
    permit.permitted.amount
  );

  return keccak256(
    encodeAbiParameters(parseAbiParameters('bytes32, bytes32, address, uint256, uint256'), [
      PERMIT_TRANSFER_FROM_TYPEHASH,
      tokenPermissionsHash,
      spender,
      permit.nonce,
      permit.deadline,
    ])
  );
}

/**
 * Create the EIP-712 typed data hash for signing
 */
function getPermitTypedDataHash(permit: PermitTransferFrom, spender: Address): `0x${string}` {
  const structHash = hashPermitTransferFrom(permit, spender);

  return keccak256(
    encodePacked(['string', 'bytes32', 'bytes32'], ['\x19\x01', DOMAIN_SEPARATOR, structHash])
  );
}

/**
 * Sign a Permit2 transfer permit using the session key
 *
 * @param token - Token address to permit
 * @param amount - Amount to permit
 * @param spender - Contract that will spend the tokens (VyreCasino)
 * @param sessionKey - Session key data for signing
 * @param deadlineSeconds - How long the permit is valid (default 5 minutes)
 * @returns Signed permit ready for playWithPermit call
 */
export async function signPermitTransfer(
  token: Address,
  amount: bigint,
  spender: Address,
  sessionKey: SessionKeyData,
  deadlineSeconds: number = 300
): Promise<SignedPermit> {
  const nonce = generateNonce();
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);

  const permit: PermitTransferFrom = {
    permitted: {
      token,
      amount,
    },
    nonce,
    deadline,
  };

  // Get the typed data hash for signing
  const digest = getPermitTypedDataHash(permit, spender);

  logger.log('🔐 [Permit2] Signing permit:', {
    token: token.slice(0, 10) + '...',
    amount: amount.toString(),
    spender: spender.slice(0, 10) + '...',
    nonce: nonce.toString(),
    deadline: new Date(Number(deadline) * 1000).toISOString(),
  });

  // Sign with session key (P256)
  const signature = signWithSessionKey(digest, sessionKey);

  logger.log('🔐 [Permit2] Permit signed successfully');

  return {
    permit,
    signature: signature as `0x${string}`,
  };
}

/**
 * Encode permit for contract call
 * Returns the tuple format expected by VyreCasino.playWithPermit
 */
export function encodePermitForCall(permit: PermitTransferFrom): {
  permitted: { token: Address; amount: bigint };
  nonce: bigint;
  deadline: bigint;
} {
  return {
    permitted: {
      token: permit.permitted.token,
      amount: permit.permitted.amount,
    },
    nonce: permit.nonce,
    deadline: permit.deadline,
  };
}
