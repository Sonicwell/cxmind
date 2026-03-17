package timeutil

import "time"

// Now returns the current time strictly in UTC.
// Replaces time.Now() to prevent timezone-related bugs.
func Now() time.Time {
	return time.Now().UTC()
}

// Unix returns the local Time corresponding to the given Unix time strictly in UTC.
// Replaces time.Unix() to prevent timezone-related bugs.
func Unix(sec int64, nsec int64) time.Time {
	return time.Unix(sec, nsec).UTC()
}

// ParseRFC3339 parses a timestamp and forces it to UTC.
func ParseRFC3339(value string) (time.Time, error) {
	t, err := time.Parse(time.RFC3339Nano, value)
	if err == nil {
		return t.UTC(), nil
	}
	return t, err
}
