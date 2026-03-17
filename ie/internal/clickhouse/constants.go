package clickhouse

// State version constants for SipCallRecord.StateVersion.
// Defined here because both hep and rtp packages import clickhouse,
// avoiding import cycles.
const (
	StateVersionInvite      = 1 // Initial call creation (INVITE)
	StateVersionAnswer      = 2 // Call answered (200 OK)
	StateVersionTermination = 3 // Normal termination (BYE/CANCEL/error)
	StateVersionTimeout     = 2 // Session timer expiration (must be < Termination to prevent overwriting completed calls)
)
