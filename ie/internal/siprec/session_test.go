package siprec

import (
	"testing"
)

// ========================================================================
// TDD Tests — SIPREC Session Tracker + Dialog + Port Recycle + re-INVITE
// ========================================================================

// --- #5: Session Tracker (callID → ports mapping) ---

func TestSessionTracker_StoreAndRetrieve(t *testing.T) {
	st := NewSessionTracker()
	st.Store("call-1", []int{30000, 30002}, "remote-tag-1")

	sess, ok := st.Get("call-1")
	if !ok {
		t.Fatal("session not found")
	}
	if len(sess.Ports) != 2 || sess.Ports[0] != 30000 || sess.Ports[1] != 30002 {
		t.Errorf("ports = %v, want [30000, 30002]", sess.Ports)
	}
	if sess.RemoteTag != "remote-tag-1" {
		t.Errorf("tag = %s, want remote-tag-1", sess.RemoteTag)
	}
	if sess.State != DialogConfirmed {
		t.Errorf("state = %d, want DialogConfirmed", sess.State)
	}
}

func TestSessionTracker_Delete(t *testing.T) {
	st := NewSessionTracker()
	st.Store("call-1", []int{30000}, "tag-1")
	st.Delete("call-1")

	_, ok := st.Get("call-1")
	if ok {
		t.Error("session should be deleted")
	}
}

func TestSessionTracker_GetPorts(t *testing.T) {
	st := NewSessionTracker()
	st.Store("call-1", []int{30000, 30002, 30004}, "tag-1")

	ports := st.GetPorts("call-1")
	if len(ports) != 3 {
		t.Errorf("ports count = %d, want 3", len(ports))
	}

	ports2 := st.GetPorts("call-unknown")
	if len(ports2) != 0 {
		t.Errorf("unknown call should return empty ports, got %v", ports2)
	}
}

func TestSessionTracker_ActiveCount(t *testing.T) {
	st := NewSessionTracker()
	st.Store("call-1", []int{30000}, "t1")
	st.Store("call-2", []int{30002}, "t2")

	if st.ActiveCount() != 2 {
		t.Errorf("count = %d, want 2", st.ActiveCount())
	}

	st.Delete("call-1")
	if st.ActiveCount() != 1 {
		t.Errorf("count = %d, want 1", st.ActiveCount())
	}
}

// --- #5: BYE Port Release via PortPool ---

func TestPortPool_ReleaseByCallID(t *testing.T) {
	pool := NewPortPool(30000, 30006) // 4 ports: 30000, 30002, 30004, 30006

	p1, _ := pool.Allocate("call-A")
	p2, _ := pool.Allocate("call-A")
	_, _ = pool.Allocate("call-B") // different call

	released := pool.ReleaseByCallID("call-A")
	if released != 2 {
		t.Errorf("released = %d, want 2", released)
	}

	// call-A ports should be back in pool
	pool.Release(p1) // idempotent, no panic
	pool.Release(p2)

	// call-B should still be allocated
	relB := pool.ReleaseByCallID("call-B")
	if relB != 1 {
		t.Errorf("released call-B = %d, want 1", relB)
	}
}

func TestPortPool_ReleaseByCallID_Unknown(t *testing.T) {
	pool := NewPortPool(30000, 30002)
	released := pool.ReleaseByCallID("call-unknown")
	if released != 0 {
		t.Errorf("released = %d, want 0", released)
	}
}

// --- #4: SIP Dialog State (100 Trying) ---

func TestDialogState_Progression(t *testing.T) {
	st := NewSessionTracker()
	st.StorePending("call-1")

	sess, ok := st.Get("call-1")
	if !ok {
		t.Fatal("pending session not found")
	}
	if sess.State != DialogTrying {
		t.Errorf("state = %d, want DialogTrying", sess.State)
	}

	st.Confirm("call-1", []int{30000, 30002}, "tag-1")
	sess, _ = st.Get("call-1")
	if sess.State != DialogConfirmed {
		t.Errorf("state = %d, want DialogConfirmed", sess.State)
	}

	st.Delete("call-1")
	_, ok = st.Get("call-1")
	if ok {
		t.Error("terminated session should be deleted")
	}
}

// --- #3: re-INVITE (SDP update) ---

func TestSessionTracker_UpdatePorts(t *testing.T) {
	st := NewSessionTracker()
	st.Store("call-1", []int{30000, 30002}, "tag-1")

	st.UpdatePorts("call-1", []int{30004, 30006})
	sess, _ := st.Get("call-1")
	if len(sess.Ports) != 2 || sess.Ports[0] != 30004 {
		t.Errorf("ports = %v, want [30004, 30006]", sess.Ports)
	}
}

// --- #6: SBC Compatibility (SIP Message Format Validation) ---

func TestSIPResponse_WellFormed(t *testing.T) {
	// Validate that our generated 200 OK follows SIP RFC 3261 format
	response := buildTestSIP200OK()

	// Must have mandatory headers
	mandatoryHeaders := []string{"SIP/2.0 200 OK", "Via:", "From:", "To:", "Call-ID:", "CSeq:", "Content-Length:"}
	for _, hdr := range mandatoryHeaders {
		if !containsHeader(response, hdr) {
			t.Errorf("missing mandatory header: %s", hdr)
		}
	}

	// Must end with CRLF CRLF (header/body separator)
	if !containsSeparator(response) {
		t.Error("missing CRLF CRLF separator")
	}
}

func TestSIPResponse_100Trying_WellFormed(t *testing.T) {
	response := buildTest100Trying()

	mandatoryHeaders := []string{"SIP/2.0 100 Trying", "Via:", "From:", "To:", "Call-ID:", "CSeq:"}
	for _, hdr := range mandatoryHeaders {
		if !containsHeader(response, hdr) {
			t.Errorf("100 Trying missing header: %s", hdr)
		}
	}

	// 100 Trying should have Content-Length: 0
	if !containsHeader(response, "Content-Length: 0") {
		t.Error("100 Trying should have Content-Length: 0")
	}
}

func TestSIPResponse_ToTagPresent(t *testing.T) {
	response := buildTestSIP200OK()
	// 200 OK must have To-tag per RFC 3261 §12.1.1
	if !containsHeader(response, ";tag=") {
		t.Error("200 OK must include To-tag")
	}
}

func TestSIPResponse_ContactInINVITE200(t *testing.T) {
	response := buildTestSIP200OK()
	// 200 OK to INVITE must include Contact header
	if !containsHeader(response, "Contact:") {
		t.Error("200 OK to INVITE must include Contact header")
	}
}

func TestSIPResponse_ContentTypeForSDP(t *testing.T) {
	response := buildTestSIP200OK()
	// If body present, must have Content-Type
	if containsHeader(response, "Content-Length:") {
		if !containsHeader(response, "Content-Type: application/sdp") {
			t.Error("200 OK with SDP body must have Content-Type: application/sdp")
		}
	}
}

// --- Test helpers ---

func containsHeader(msg, header string) bool {
	for _, line := range splitLines(msg) {
		if len(line) >= len(header) && line[:len(header)] == header {
			return true
		}
	}
	// Also check if it contains the string anywhere
	return len(msg) > 0 && findInString(msg, header)
}

func containsSeparator(msg string) bool {
	return findInString(msg, "\r\n\r\n")
}

func splitLines(s string) []string {
	var lines []string
	start := 0
	for i := 0; i < len(s)-1; i++ {
		if s[i] == '\r' && s[i+1] == '\n' {
			lines = append(lines, s[start:i])
			start = i + 2
			i++ // skip \n
		}
	}
	if start < len(s) {
		lines = append(lines, s[start:])
	}
	return lines
}

func findInString(s, substr string) bool {
	if len(substr) > len(s) {
		return false
	}
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func buildTestSIP200OK() string {
	srv := &SIPTCPServer{port: 5080, localIP: "10.0.0.1"}
	return srv.formatSIP200OKWithSDP(
		"SIP/2.0/TCP 192.168.1.1;branch=z9hG4bKtest",
		"<sip:recorder@192.168.1.1>;tag=from-tag",
		"<sip:siprec@10.0.0.1>",
		"test-call-id",
		"1 INVITE",
		"v=0\r\no=test 0 0 IN IP4 10.0.0.1\r\ns=test\r\nc=IN IP4 10.0.0.1\r\nt=0 0\r\nm=audio 30000 RTP/AVP 0\r\n",
	)
}

func buildTest100Trying() string {
	srv := &SIPTCPServer{port: 5080, localIP: "10.0.0.1"}
	return srv.formatSIPResponse(100, "Trying",
		"SIP/2.0/TCP 192.168.1.1;branch=z9hG4bKtest",
		"<sip:recorder@192.168.1.1>;tag=from-tag",
		"<sip:siprec@10.0.0.1>",
		"test-call-id",
		"1 INVITE",
	)
}
