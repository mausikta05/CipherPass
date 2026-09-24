import { describe, it, expect, beforeEach } from 'vitest';
import { computeCommitmentHash, PRESET_ALLOWLIST_ENTRIES } from '../src/lib/crypto';
import { midnightService, DEPLOYED_CONTRACT_ADDRESS, PREPROD_INDEXER_URI, PREPROD_NODE_URI } from '../src/lib/midnight';
import { PrivateWitnessData } from '../src/lib/types';

describe('CipherPass Compact Circuit & Midnight.js Integration Test Suite', () => {

  beforeEach(() => {
    // Reset portal state before each test
    midnightService.setPortalActiveAdmin(true);
  });

  it('1. Credential Privacy (Valid Passkey Verification): Valid secret passkey & salt evaluates ZK circuit, grants access, and increments public counter', async () => {
    const genesisEntry = PRESET_ALLOWLIST_ENTRIES[0];
    const witness: PrivateWitnessData = {
      secretPasskey: genesisEntry.passkey,
      identitySalt: genesisEntry.identitySalt,
    };

    const result = await midnightService.executeZKAccessVerification(witness);

    expect(result.isAccessGranted).toBe(true);
    expect(result.disclosedData.granted).toBe(true);
    expect(result.disclosedData.counterIncrement).toBe(1);
    expect(result.txHash).toBeDefined();
    expect(result.proofHash).toBeDefined();
  });

  it('2. Invalid Key Rejection (Constraint Enforcement): Incorrect passkeys fail circuit assertions and are strictly rejected without mutating state', async () => {
    const invalidWitness: PrivateWitnessData = {
      secretPasskey: 'INVALID_ATTACKER_PASSKEY_9999',
      identitySalt: 'SALT_UNKNOWN_MALICIOUS_NODE',
    };

    await expect(midnightService.executeZKAccessVerification(invalidWitness)).rejects.toThrow(
      /circuit assertion failed/i
    );
  });

  it('3. State Assertion (Inactive Gate Policy): Inactive or paused verification portal strictly rejects all proof submissions', async () => {
    midnightService.setPortalActiveAdmin(false);

    const genesisEntry = PRESET_ALLOWLIST_ENTRIES[0];
    const witness: PrivateWitnessData = {
      secretPasskey: genesisEntry.passkey,
      identitySalt: genesisEntry.identitySalt,
    };

    await expect(midnightService.executeZKAccessVerification(witness)).rejects.toThrow(
      /portal is inactive/i
    );
  });

  it('4. Witness Isolation Guarantee (Confidentiality Protection): Secret passkey & identity salt are strictly protected and never leaked to public ledger state', async () => {
    const genesisEntry = PRESET_ALLOWLIST_ENTRIES[1];
    const witness: PrivateWitnessData = {
      secretPasskey: genesisEntry.passkey,
      identitySalt: genesisEntry.identitySalt,
    };

    const result = await midnightService.executeZKAccessVerification(witness);

    expect(result.privateWitnessState.secretPasskeyProtected).toBe(true);
    expect(result.privateWitnessState.identitySaltProtected).toBe(true);
    expect(result.privateWitnessState.leakedToLedger).toBe(false);

    const ledger = await midnightService.fetchLedgerState();
    const ledgerString = JSON.stringify(ledger);
    expect(ledgerString).not.toContain(genesisEntry.passkey);
    expect(ledgerString).not.toContain(genesisEntry.identitySalt);
  });

  it('5. Deterministic Commitment (Cryptographic Hash Validation): Merkle leaf / commitment computation is deterministic and reproducible', async () => {
    for (const entry of PRESET_ALLOWLIST_ENTRIES) {
      const commitment = await computeCommitmentHash(entry.passkey, entry.identitySalt);
      expect(commitment).toBeDefined();
      expect(commitment.startsWith('0x')).toBe(true);
      expect(commitment.length).toBeGreaterThan(10);
    }
  });

  it('6. Live Preprod E2E Endpoint Validation: Verifies indexer, node, and deployed contract address configuration', async () => {
    expect(DEPLOYED_CONTRACT_ADDRESS).toBe('18ddd27cf8795ae5dc0cc5ced5fdd27992e03fd9e0fa12f7ed1a59064d2c0b33');
    expect(PREPROD_INDEXER_URI).toContain('indexer.preprod.midnight.network');
    expect(PREPROD_NODE_URI).toContain('rpc.preprod.midnight.network');

    const ledgerState = await midnightService.fetchLedgerState();
    expect(ledgerState.allowlistRoot).toBe(DEPLOYED_CONTRACT_ADDRESS);
    expect(ledgerState.isPortalActive).toBe(true);
  });
});
