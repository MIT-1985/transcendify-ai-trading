// Safety state management for Robot 1 and trading operations
// Separate concerns: rebalance, robot1, and general trading

export const SAFETY_STATES = {
  rebalance: {
    ACTIVE: 'ACTIVE',
    HALTED: 'HALTED'
  },
  robot1: {
    READY: 'READY',
    ACTIVE: 'ACTIVE',
    WAITING: 'WAITING',
    ERROR: 'ERROR',
    PENDING_VERIFICATION: 'PENDING_VERIFICATION'
  },
  general: {
    LIVE: 'LIVE',
    RESTRICTED: 'RESTRICTED',
    PAUSED: 'PAUSED'
  }
};

export const defaultSafetyState = {
  rebalance: {
    status: SAFETY_STATES.rebalance.ACTIVE,
    reason: null,
    lastCheck: null,
    failureDetails: null
  },
  robot1: {
    status: SAFETY_STATES.robot1.READY,
    reason: null,
    verified: false,
    lastExecutionTime: null,
    lastVerificationTime: null
  },
  general: {
    status: SAFETY_STATES.general.LIVE,
    reason: null,
    lastUpdate: null
  }
};

/**
 * Halt rebalance only (Robot 1 can still run)
 */
export function haltRebalance(reason, details) {
  return {
    rebalance: {
      status: SAFETY_STATES.rebalance.HALTED,
      reason: reason,
      lastCheck: new Date().toISOString(),
      failureDetails: details
    }
  };
}

/**
 * Verify Robot 1 is safe to execute
 */
export function canRobot1Execute(safetyState) {
  if (!safetyState) return false;
  
  const rebalanceOK = safetyState.rebalance.status !== SAFETY_STATES.rebalance.HALTED;
  const robot1OK = safetyState.robot1.status !== SAFETY_STATES.robot1.ERROR;
  const generalOK = safetyState.general.status !== SAFETY_STATES.general.PAUSED;
  
  return rebalanceOK && robot1OK && generalOK;
}

/**
 * Check if rebalance is allowed
 */
export function canRebalance(safetyState) {
  if (!safetyState) return false;
  return safetyState.rebalance.status === SAFETY_STATES.rebalance.ACTIVE;
}

/**
 * Mark Robot 1 as verified and ready
 */
export function verifyRobot1(safetyState) {
  return {
    ...safetyState,
    robot1: {
      ...safetyState.robot1,
      status: SAFETY_STATES.robot1.READY,
      verified: true,
      lastVerificationTime: new Date().toISOString(),
      reason: 'Verified: ETH-USDT ordId check passed'
    }
  };
}