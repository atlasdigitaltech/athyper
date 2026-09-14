package main

import (
 "encoding/json"
 "fmt"
 "os"
 "strings"
 "syscall"
)

func secret(name string) string {
 b, err := os.ReadFile("/run/secrets/" + name)
 b = []byte(strings.TrimRight(string(b), "\n"))
 if err != nil || len(b) == 0 || strings.ContainsAny(string(b), "\x00\r\n") {
  fmt.Fprintln(os.Stderr, "missing or invalid storage secret:", name)
  os.Exit(1)
 }
 return string(b)
}
func identity(name, access, password string, actions []string) map[string]any {
 return map[string]any{"name":name,"credentials":[]map[string]string{{"accessKey":access,"secretKey":password}},"actions":actions}
}
func main() {
 ids := []map[string]any{
  identity("athyper-admin", "athyper-admin", secret("minio-root-password"), []string{"Admin"}),
  identity("athyper-app", secret("objectstorage-app-access-key"), secret("objectstorage-app-secret-key"), []string{"Read:athyper-documents","Write:athyper-documents","List:athyper-documents","Tagging:athyper-documents","Read:athyper-transfers","Write:athyper-transfers","List:athyper-transfers","Tagging:athyper-transfers","Read:athyper-artifacts"}),
  identity("athyper-artifacts-writer", secret("objectstorage-artifacts-writer-access-key"), secret("objectstorage-artifacts-writer-secret-key"), []string{"Read:athyper-artifacts","Write:athyper-artifacts","List:athyper-artifacts"}),
 }
 config, err := json.Marshal(map[string]any{"identities":ids})
 if err == nil {err = os.WriteFile("/tmp/s3.json",config,0600)}
 if err != nil {fmt.Fprintln(os.Stderr,"cannot write storage authentication config");os.Exit(1)}
 args := []string{"weed","server","-dir=/data","-ip=127.0.0.1","-ip.bind=127.0.0.1","-master.volumeSizeLimitMB=256","-volume.max=32","-filer","-filer.exposeDirectoryData=false","-s3","-s3.ip.bind=0.0.0.0","-s3.port=9000","-s3.config=/tmp/s3.json","-s3.iam=false","-s3.port.iceberg=0","-s3.port.lance=0","-s3.allowDeleteBucketNotEmpty=false","-s3.autoCreateBucket=false"}
 if err := syscall.Exec("/usr/bin/weed",args,os.Environ()); err != nil {fmt.Fprintln(os.Stderr,err);os.Exit(1)}
}
