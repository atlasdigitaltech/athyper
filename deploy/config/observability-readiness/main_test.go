package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestReadinessStatus(t *testing.T) {
	for _, status := range []int{200, 302, 503} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(status) }))
		err := ready(server.URL, &http.Client{Timeout: time.Second})
		server.Close()
		if (err == nil) != (status == 200) {
			t.Fatalf("status %d: %v", status, err)
		}
	}
}
func TestReadinessTimeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { <-r.Context().Done() }))
	defer server.Close()
	if ready(server.URL, &http.Client{Timeout: 20 * time.Millisecond}) == nil {
		t.Fatal("hung endpoint must fail")
	}
}
