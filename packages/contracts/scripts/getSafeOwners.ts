import { createPublicClient, http } from 'viem';

const SAFE_ADDRESS = '0x108ca5cf713cb0b964d187f19cd7b7d317841c31';
const RPC_URL = 'https://testnet.riselabs.xyz';

const SAFE_ABI = [
  {
    name: 'getOwners',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address[]' }],
  },
  {
    name: 'getThreshold',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

async function main() {
  const client = createPublicClient({
    transport: http(RPC_URL),
  });

  console.log('Querying SAFE at:', SAFE_ADDRESS);
  console.log('RPC:', RPC_URL);
  console.log('---');

  const owners = await client.readContract({
    address: SAFE_ADDRESS,
    abi: SAFE_ABI,
    functionName: 'getOwners',
  });

  const threshold = await client.readContract({
    address: SAFE_ADDRESS,
    abi: SAFE_ABI,
    functionName: 'getThreshold',
  });

  console.log(`\nSAFE Multisig Configuration:`);
  console.log(`Threshold: ${threshold}/${owners.length}`);
  console.log(`\nOwners (Signers):`);
  owners.forEach((owner, i) => {
    console.log(`  ${i + 1}. ${owner}`);
  });
}

main().catch(console.error);
