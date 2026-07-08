package bundle

import (
	"encoding/json"
	"os"
	"regexp"
	"strings"
)

// RuntimeEnvIndex is the built entry document that carries the runtime env
// placeholder. It is the only file the injection touches.
const RuntimeEnvIndex = "index.html"

// placeholderRe matches the @import-meta-env runtime placeholder emitted into the
// built index.html — `JSON.parse('"import_meta_env_placeholder"')` — tolerant of
// the quote style / spacing a minifier may produce.
var placeholderRe = regexp.MustCompile(`JSON\.parse\([^)]*import_meta_env_placeholder[^)]*\)`)

// renderRuntimeEnv materialises the runtime env in the entry document by replacing
// the @import-meta-env placeholder with the current VITE_* environment as a JS
// object literal. This mirrors the injection the site is served with, so the
// signed bundle carries the same config — while the shipped file on disk stays
// untouched (only the in-memory bundle copy is rewritten).
//
// If the placeholder is absent (already materialised, or nothing to inject) the
// content is returned unchanged.
func renderRuntimeEnv(content []byte) ([]byte, error) {
	if !placeholderRe.Match(content) {
		return content, nil
	}

	env := map[string]string{}
	for _, kv := range os.Environ() {
		if !strings.HasPrefix(kv, "VITE_") {
			continue
		}
		key, value, _ := strings.Cut(kv, "=")
		env[key] = value
	}

	// json.Marshal escapes <, > and &, so a value cannot break out of the
	// surrounding <script> tag.
	encoded, err := json.Marshal(env)
	if err != nil {
		return nil, err
	}

	// ReplaceAllLiteral: the encoded JSON must not be interpreted as a $-expansion.
	return placeholderRe.ReplaceAllLiteral(content, encoded), nil
}
