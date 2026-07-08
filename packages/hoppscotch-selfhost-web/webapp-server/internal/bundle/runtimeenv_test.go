package bundle

import (
	"bytes"
	"encoding/json"
	"testing"
)

func extractEnvObject(t *testing.T, rendered []byte) map[string]string {
	t.Helper()
	start := bytes.IndexByte(rendered, '{')
	end := bytes.LastIndexByte(rendered, '}')
	if start < 0 || end < 0 || end < start {
		t.Fatalf("no JSON object in rendered output: %s", rendered)
	}
	var m map[string]string
	if err := json.Unmarshal(rendered[start:end+1], &m); err != nil {
		t.Fatalf("rendered env is not valid JSON: %v (%s)", err, rendered)
	}
	return m
}

func TestRenderRuntimeEnv(t *testing.T) {
	t.Setenv("VITE_BASE_URL", "http://localhost:3000")
	t.Setenv("VITE_TOKEN", `a"b\c</script>x`)
	t.Setenv("NOT_VITE", "ignored")

	in := []byte(`globalThis.import_meta_env = JSON.parse('"import_meta_env_placeholder"');`)
	got, err := renderRuntimeEnv(in)
	if err != nil {
		t.Fatal(err)
	}

	m := extractEnvObject(t, got)
	if m["VITE_BASE_URL"] != "http://localhost:3000" || m["VITE_TOKEN"] != `a"b\c</script>x` {
		t.Fatalf("values did not round-trip: %#v", m)
	}
	if _, ok := m["NOT_VITE"]; ok {
		t.Fatalf("non-VITE var leaked into env: %#v", m)
	}
	if bytes.Contains(got, []byte("</script>")) {
		t.Fatalf("output is not HTML-escaped: %s", got)
	}
}

func TestRenderRuntimeEnvNoPlaceholder(t *testing.T) {
	in := []byte(`<html><body>no placeholder here</body></html>`)
	got, err := renderRuntimeEnv(in)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, in) {
		t.Fatalf("content changed unexpectedly: %s", got)
	}
}
