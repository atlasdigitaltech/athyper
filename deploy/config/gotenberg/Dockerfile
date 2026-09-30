FROM golang:1.27.1-alpine@sha256:cf6fca6641884b8433441b2b0652976f975e1d0fdd26d177eaaf8596087f3125 AS pdfcpu
WORKDIR /build
RUN go mod init athyper.local/pdfcpu-build \
 && go get github.com/pdfcpu/pdfcpu/cmd/pdfcpu@v0.15.0 \
 && go get golang.org/x/crypto@v0.55.0 golang.org/x/image@v0.45.0 \
 && CGO_ENABLED=0 go build -trimpath -o /out/pdfcpu github.com/pdfcpu/pdfcpu/cmd/pdfcpu
FROM gotenberg/gotenberg:8.37.0@sha256:f29984bd1e226bf1b93ba90af06000afa8b315853e99d27b9aaa41b93f15c769
USER root
# wheel is a vendored build tool; the runtime does not build Python packages.
# Remove the complete unused setuptools build-tool package, not just metadata.
RUN apt-get update && apt-get purge -y python3-setuptools && rm -rf /var/lib/apt/lists/*
COPY --from=pdfcpu /out/pdfcpu /usr/bin/pdfcpu
USER gotenberg
