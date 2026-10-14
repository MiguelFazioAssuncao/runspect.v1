package runner

import (
	"container/list"
	"sync"
)

type analysisEntry struct {
	key    [32]byte
	result AnalysisResult
}

// Analysis capabilities depend on source and the compiler frontend, never on
// stdin. Keep only successful results in a bounded, per-runner memory cache.
type analysisCache struct {
	mu      sync.Mutex
	entries map[[32]byte]*list.Element
	order   list.List
}

func cloneCapabilities(capabilities []string) []string {
	return append([]string{}, capabilities...)
}

func (c *analysisCache) get(key [32]byte, maxEntries int) (AnalysisResult, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.trim(maxEntries)
	entry := c.entries[key]
	if entry == nil {
		return AnalysisResult{}, false
	}
	c.order.MoveToFront(entry)
	result := entry.Value.(analysisEntry).result
	result.Capabilities = cloneCapabilities(result.Capabilities)
	return result, true
}

func (c *analysisCache) put(key [32]byte, result AnalysisResult, maxEntries int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.trim(maxEntries)
	if maxEntries <= 0 || !result.Success {
		return
	}
	if c.entries == nil {
		c.entries = make(map[[32]byte]*list.Element)
	}
	result.Capabilities = cloneCapabilities(result.Capabilities)
	// These fields describe each request, not the work that filled the cache.
	result.TimeMs, result.CacheHit = 0, false
	if old := c.entries[key]; old != nil {
		old.Value = analysisEntry{key: key, result: result}
		c.order.MoveToFront(old)
	} else {
		c.entries[key] = c.order.PushFront(analysisEntry{key: key, result: result})
	}
	c.trim(maxEntries)
}

func (c *analysisCache) trim(maxEntries int) {
	for c.order.Len() > 0 && (maxEntries <= 0 || c.order.Len() > maxEntries) {
		old := c.order.Back()
		delete(c.entries, old.Value.(analysisEntry).key)
		c.order.Remove(old)
	}
}
