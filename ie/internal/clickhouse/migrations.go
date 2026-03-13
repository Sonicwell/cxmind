package clickhouse

import (
	"context"
	"fmt"
	"log"
	"sort"

	"github.com/cxmind/ingestion-go/internal/timeutil"
)

// Migration represents a single versioned schema change.
type Migration struct {
	Version     int
	Description string
	SQL         string
}

// migrationRegistry holds all registered migrations, executed in order.
// New migrations should be appended here with incrementing version numbers.
var migrationRegistry = []Migration{
	{
		Version:     1,
		Description: "Add asr_source to transcription_segments",
		SQL:         "ALTER TABLE transcription_segments ADD COLUMN IF NOT EXISTS asr_source String DEFAULT 'realtime'",
	},
	{
		Version:     2,
		Description: "Add client_id to call_events",
		SQL:         "ALTER TABLE call_events ADD COLUMN IF NOT EXISTS client_id String",
	},
	{
		Version:     3,
		Description: "Add GeoIP columns to call_events",
		SQL: `ALTER TABLE call_events ADD COLUMN IF NOT EXISTS src_country String;
ALTER TABLE call_events ADD COLUMN IF NOT EXISTS src_city String;
ALTER TABLE call_events ADD COLUMN IF NOT EXISTS dst_country String;
ALTER TABLE call_events ADD COLUMN IF NOT EXISTS dst_city String`,
	},
	{
		Version:     4,
		Description: "Add GeoIP + direction columns to rtcp_reports",
		SQL: `ALTER TABLE rtcp_reports ADD COLUMN IF NOT EXISTS direction String;
ALTER TABLE rtcp_reports ADD COLUMN IF NOT EXISTS src_country String;
ALTER TABLE rtcp_reports ADD COLUMN IF NOT EXISTS src_city String;
ALTER TABLE rtcp_reports ADD COLUMN IF NOT EXISTS dst_country String;
ALTER TABLE rtcp_reports ADD COLUMN IF NOT EXISTS dst_city String`,
	},
	{
		Version:     5,
		Description: "omni_messages table now managed exclusively by AS — no-op",
		SQL:         `SELECT 1`,
	},
}

// initMigrationTable creates the schema_migrations tracking table.
func initMigrationTable() error {
	query := `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    UInt32,
			applied_at DateTime64(3),
			description String
		) ENGINE = MergeTree()
		ORDER BY version
	`
	return Client.Exec(context.Background(), query)
}

// getAppliedMigrations returns the set of already-applied migration versions.
func getAppliedMigrations() (map[int]bool, error) {
	rows, err := Client.Query(context.Background(), "SELECT version FROM schema_migrations")
	if err != nil {
		return nil, fmt.Errorf("failed to query schema_migrations: %w", err)
	}
	defer rows.Close()

	applied := make(map[int]bool)
	for rows.Next() {
		var version uint32
		if err := rows.Scan(&version); err != nil {
			return nil, err
		}
		applied[int(version)] = true
	}
	return applied, nil
}

// RunMigrations executes all pending migrations in version order.
// Safe to call on every startup — already-applied migrations are skipped.
func RunMigrations() error {
	if err := initMigrationTable(); err != nil {
		return fmt.Errorf("failed to init migration table: %w", err)
	}

	applied, err := getAppliedMigrations()
	if err != nil {
		return err
	}

	// Sort by version to ensure deterministic order
	sorted := make([]Migration, len(migrationRegistry))
	copy(sorted, migrationRegistry)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Version < sorted[j].Version })

	for _, m := range sorted {
		if applied[m.Version] {
			continue
		}

		log.Printf("[Migration] Applying v%d: %s", m.Version, m.Description)

		if err := Client.Exec(context.Background(), m.SQL); err != nil {
			return fmt.Errorf("migration v%d failed: %w", m.Version, err)
		}

		// Record migration
		if err := Client.Exec(context.Background(),
			"INSERT INTO schema_migrations (version, applied_at, description) VALUES (?, ?, ?)",
			uint32(m.Version), timeutil.Now().UTC(), m.Description,
		); err != nil {
			log.Printf("[Migration] Warning: failed to record v%d: %v", m.Version, err)
		}

		log.Printf("[Migration] Applied v%d successfully", m.Version)
	}

	return nil
}
