package sniffer

import (
	"github.com/cxmind/ingestion-go/internal/config"

	"log"
	"net"
	"strconv"
	"sync"
)

// ServerIPSet manages the set of "our" server IPs for direction detection.
// Supports two matching modes:
//   - wildIPs: pure IP → matches regardless of port (backward compat)
//   - portIPs: IP → {port set} → matches only when both IP and port match
//
// A packet whose src matches is outbound; dst matches is inbound.
// Thread-safe via sync.RWMutex for potential runtime reloads.
type ServerIPSet struct {
	mu      sync.RWMutex
	wildIPs map[string]bool            // 纯 IP 通配（不限端口）
	portIPs map[string]map[uint16]bool // IP → 精确端口集合
}

// globalServerIPs is the singleton used by the SIP sniffer.
var globalServerIPs = &ServerIPSet{
	wildIPs: make(map[string]bool),
	portIPs: make(map[string]map[uint16]bool),
}

// InitServerIPs builds the server IP set from:
//  1. sniffer.server_ips (explicit config list, supports "ip" and "ip:port")
//  2. sniffer.auto_discover == true → enumerate all local interface IPs (wild)
//  3. sip.public_ip (if set, wild)
//
// Must be called once during startup, before the sniffer starts.
func InitServerIPs() {
	globalServerIPs.mu.Lock()
	defer globalServerIPs.mu.Unlock()

	globalServerIPs.wildIPs = make(map[string]bool)
	globalServerIPs.portIPs = make(map[string]map[uint16]bool)

	// 1. Explicit config — supports both "ip" and "ip:port"
	for _, entry := range config.Global.GetStringSlice("sniffer.server_ips") {
		ip, port, hasPort := parseHostPort(entry)
		ip = normalizeIP(ip)
		if ip == "" {
			continue
		}
		if hasPort {
			if globalServerIPs.portIPs[ip] == nil {
				globalServerIPs.portIPs[ip] = make(map[uint16]bool)
			}
			globalServerIPs.portIPs[ip][port] = true
		} else {
			globalServerIPs.wildIPs[ip] = true
		}
	}

	// 2. Auto-discover local interfaces (wild, no port constraint)
	if config.Global.GetBool("sniffer.auto_discover") {
		discoverLocalIPs(globalServerIPs.wildIPs)
	}

	// 3. sip.public_ip (shared with HEP mode, wild)
	if pub := config.Global.GetString("sip.public_ip"); pub != "" {
		ip := normalizeIP(pub)
		if ip != "" {
			globalServerIPs.wildIPs[ip] = true
		}
		// Also resolve if hostname
		if net.ParseIP(pub) == nil {
			if addrs, err := net.LookupIP(pub); err == nil {
				for _, a := range addrs {
					globalServerIPs.wildIPs[a.String()] = true
				}
			}
		}
	}

	totalWild := len(globalServerIPs.wildIPs)
	totalPort := 0
	for _, ports := range globalServerIPs.portIPs {
		totalPort += len(ports)
	}
	log.Printf("[SNIFFER] Server IP set initialized: %d wild IPs, %d ip:port entries (wild=%v, port=%v)",
		totalWild, totalPort, globalServerIPs.listWildIPs(), globalServerIPs.listPortEntries())
}

// Match returns true if (ip, port) matches the server set.
// Priority: wildIPs (any port) > portIPs (exact port).
func (s *ServerIPSet) Match(ip string, port uint16) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// 纯 IP 通配优先
	if s.wildIPs[ip] {
		return true
	}
	// 精确端口匹配
	if ports, ok := s.portIPs[ip]; ok {
		return ports[port]
	}
	return false
}

// Contains returns true if ip is in the wild set (backward compat, ignores port).
func (s *ServerIPSet) Contains(ip string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.wildIPs[ip] {
		return true
	}
	// 有任何端口条目也算包含该 IP
	_, hasPort := s.portIPs[ip]
	return hasPort
}

// IsServerIP is a convenience wrapper around the global instance.
// port=0 时退化为纯 IP 匹配（兼容自动发现）
func IsServerIP(ip string, port uint16) bool {
	return globalServerIPs.Match(ip, port)
}

// Count returns the total number of entries in the set.
func (s *ServerIPSet) Count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	count := len(s.wildIPs)
	for _, ports := range s.portIPs {
		count += len(ports)
	}
	return count
}

// listWildIPs returns all wild IPs for logging.
func (s *ServerIPSet) listWildIPs() []string {
	result := make([]string, 0, len(s.wildIPs))
	for ip := range s.wildIPs {
		result = append(result, ip)
	}
	return result
}

// listPortEntries returns all ip:port entries for logging.
func (s *ServerIPSet) listPortEntries() []string {
	var result []string
	for ip, ports := range s.portIPs {
		for port := range ports {
			result = append(result, ip+":"+strconv.Itoa(int(port)))
		}
	}
	return result
}

// discoverLocalIPs adds all local interface IPs to the set.
func discoverLocalIPs(set map[string]bool) {
	// Always consider loopback
	set["127.0.0.1"] = true
	set["::1"] = true

	interfaces, err := net.Interfaces()
	if err != nil {
		log.Printf("[SNIFFER] WARN: failed to enumerate interfaces: %v", err)
		return
	}
	for _, iface := range interfaces {
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip != nil {
				set[ip.String()] = true
			}
		}
	}
}

// normalizeIP trims whitespace and validates.
func normalizeIP(s string) string {
	ip := net.ParseIP(s)
	if ip == nil {
		return s // hostname — keep as-is for DNS lookup later
	}
	return ip.String()
}

// parseHostPort splits "ip:port" or plain "ip".
// Returns (ip, port, hasPort).
func parseHostPort(entry string) (string, uint16, bool) {
	host, portStr, err := net.SplitHostPort(entry)
	if err != nil {
		// 没有端口 — 纯 IP 或 hostname
		return entry, 0, false
	}
	p, err := strconv.Atoi(portStr)
	if err != nil || p <= 0 || p > 65535 {
		log.Printf("[SNIFFER] WARN: invalid port in server_ips entry %q, treating as wild IP", entry)
		return host, 0, false
	}
	return host, uint16(p), true
}
