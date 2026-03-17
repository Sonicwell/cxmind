package geoip

import (
	"github.com/cxmind/ingestion-go/internal/config"

	"fmt"
	"log"
	"net"
	"sync"
	"time"

	"github.com/oschwald/geoip2-golang"
	gocache "github.com/patrickmn/go-cache"
)

var (
	db   *geoip2.Reader
	once sync.Once

	// GEO-1: LRU cache for GeoIP lookups to avoid repeated disk reads.
	// At 5000 concurrent calls, many IPs repeat frequently (e.g. PBX IPs).
	lookupCache *gocache.Cache
)

// Initialize loads the GeoIP database and initializes the lookup cache.
func Initialize() error {
	var err error
	once.Do(func() {
		dbPath := config.Global.GetString("geoip.path")
		if dbPath == "" {
			dbPath = "config/GeoLite2-City.mmdb"
		}

		db, err = geoip2.Open(dbPath)
		if err != nil {
			log.Printf("Warning: Could not open GeoIP database at %s: %v. GeoIP stats will be empty.", dbPath, err)
			return
		}
		log.Printf("GeoIP database loaded from %s", dbPath)

		// Initialize LRU cache: 5min expiry, cleanup every 10min
		lookupCache = gocache.New(5*time.Minute, 10*time.Minute)
	})
	return err
}

// Location represents the geographic location of an IP
type Location struct {
	Country string
	City    string
}

// Lookup returns the country and city for a given IP address.
// GEO-1: Results are cached to avoid repeated MaxMind DB reads.
func Lookup(ipStr string) (*Location, error) {
	// Mock Data for Demo/Dev if DB is missing
	if db == nil {
		// Simple determinstic mock based on last octet
		ip := net.ParseIP(ipStr)
		if ip == nil {
			return &Location{Country: "US", City: "New York"}, nil
		}

		var hash int
		if ip4 := ip.To4(); ip4 != nil {
			hash = int(ip4[3]) + int(ip4[2])
		} else {
			hash = int(ip[len(ip)-1])
		}

		countries := []struct{ Country, City string }{
			{"US", "New York"},
			{"US", "San Francisco"},
			{"US", "Chicago"},
			{"GB", "London"},
			{"DE", "Berlin"},
			{"FR", "Paris"},
			{"JP", "Tokyo"},
			{"SG", "Singapore"},
			{"AU", "Sydney"},
			{"BR", "São Paulo"},
			{"IN", "Mumbai"},
			{"CN", "Shanghai"},
		}

		idx := hash % len(countries)
		return &Location{
			Country: countries[idx].Country,
			City:    countries[idx].City,
		}, nil
	}

	// GEO-1: Check cache first
	if lookupCache != nil {
		if cached, found := lookupCache.Get(ipStr); found {
			return cached.(*Location), nil
		}
	}

	ip := net.ParseIP(ipStr)
	if ip == nil {
		return nil, fmt.Errorf("invalid IP address: %s", ipStr)
	}

	record, err := db.City(ip)
	if err != nil {
		// Fallback to mock if lookup fails
		return &Location{Country: "US", City: "New York"}, nil
	}

	loc := &Location{
		Country: record.Country.IsoCode,
		City:    record.City.Names["en"],
	}

	// If City is empty, try to get valid country at least
	if loc.Country == "" && record.RegisteredCountry.IsoCode != "" {
		loc.Country = record.RegisteredCountry.IsoCode
	}

	// If still empty, mock it
	if loc.Country == "" {
		loc.Country = "US"
		loc.City = "Unknown"
	}

	// GEO-1: Store in cache
	if lookupCache != nil {
		lookupCache.Set(ipStr, loc, 0) // Use default TTL
	}

	return loc, nil
}

// Close closes the database connection
func Close() {
	if db != nil {
		db.Close()
	}
}
