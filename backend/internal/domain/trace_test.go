package domain

import "testing"

func TestTraceOptionsDefaultsAndCeilings(t *testing.T) {
	if got := (TraceOptions{}).Normalized(); got != (TraceOptions{2000, 256}) {
		t.Fatalf("defaults=%+v", got)
	}
	if got := (TraceOptions{20000, 9000}).Normalized(); got != (TraceOptions{10000, 2048}) {
		t.Fatalf("ceilings=%+v", got)
	}
	for _, options := range []TraceOptions{{}, {1, 1}, {10000, 2048}} {
		if !options.Valid() {
			t.Fatalf("valid options rejected: %+v", options)
		}
	}
	for _, options := range []TraceOptions{{-1, 0}, {0, -1}, {10001, 1}, {1, 2049}} {
		if options.Valid() {
			t.Fatalf("invalid options accepted: %+v", options)
		}
	}
}
