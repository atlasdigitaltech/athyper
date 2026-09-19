package main

import (
	"fmt"
	"net/http"
	"os"
	"time"
)

func ready(url string, client *http.Client) error {
	response, err := client.Get(url)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("readiness returned HTTP %d", response.StatusCode)
	}
	return nil
}

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: readiness <local HTTP URL>")
		os.Exit(2)
	}
	client := &http.Client{
		Timeout:       4 * time.Second,
		Transport:     &http.Transport{Proxy: nil},
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
	}
	if err := ready(os.Args[1], client); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
