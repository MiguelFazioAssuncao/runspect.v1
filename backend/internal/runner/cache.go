package runner

import (
	"container/list"
	"crypto/sha256"
	"os"
	"path/filepath"
	"sync"
)

type compiledProgram struct {
	binary []byte
	trace  instrumentation
}

type compiledEntry struct {
	key     [32]byte
	program compiledProgram
}

// Store binaries, never results: each request executes with its current stdin
// and the usual sandbox/limits. The LRU is bounded in both bytes and entries.
type compiledCache struct {
	mu        sync.Mutex
	entries   map[[32]byte]*list.Element
	order     list.List
	bytes     int
	evictions uint64
}

func (c *compiledCache) get(key [32]byte, maxBytes int) (compiledProgram, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if maxBytes <= 0 {
		return compiledProgram{}, false
	}
	entry := c.entries[key]
	if entry == nil {
		return compiledProgram{}, false
	}
	c.order.MoveToFront(entry)
	return entry.Value.(compiledEntry).program, true
}

func (c *compiledCache) put(key [32]byte, program compiledProgram, maxBytes, maxEntries int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if maxBytes <= 0 || maxEntries <= 0 || len(program.binary) > maxBytes {
		return
	}
	if c.entries == nil {
		c.entries = make(map[[32]byte]*list.Element)
	}
	if old := c.entries[key]; old != nil {
		c.bytes -= len(old.Value.(compiledEntry).program.binary)
		c.order.Remove(old)
	}
	c.entries[key] = c.order.PushFront(compiledEntry{key: key, program: program})
	c.bytes += len(program.binary)
	for c.bytes > maxBytes || c.order.Len() > maxEntries {
		old := c.order.Back()
		entry := old.Value.(compiledEntry)
		delete(c.entries, entry.key)
		c.bytes -= len(entry.program.binary)
		c.order.Remove(old)
		c.evictions++
	}
}

func (c *compiledCache) stats() (entries, bytes int, evictions uint64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.order.Len(), c.bytes, c.evictions
}

func (r *CppRunner) cacheKey(code string, header []byte) [32]byte {
	hash := sha256.New()
	// Hash components separately so boundaries cannot collide. Invalidate when
	// source, instrumentation, headers or compiler runtime configuration changes.
	for _, data := range [][]byte{[]byte(code), header, []byte(r.ClangRuntimePath), []byte(r.CompilerCachePath), []byte("g++ -O0 -pipe -std=c++17 -DRUNSPECT_TRACE_FD=3")} {
		sum := sha256.Sum256(data)
		hash.Write(sum[:])
	}
	for _, name := range []string{"automatic.h", "instrument_cpp.py"} {
		data, _ := os.ReadFile(filepath.Join(filepath.Dir(r.HeaderPath), name))
		sum := sha256.Sum256(data)
		hash.Write(sum[:])
	}
	var key [32]byte
	copy(key[:], hash.Sum(nil))
	return key
}
