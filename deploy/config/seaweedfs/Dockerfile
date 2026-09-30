FROM golang:1.27.1-alpine@sha256:cf6fca6641884b8433441b2b0652976f975e1d0fdd26d177eaaf8596087f3125 AS build
WORKDIR /build
RUN go mod init athyper.local/seaweedfs-build \
 && go get github.com/seaweedfs/seaweedfs/weed@4.46 \
 && go get google.golang.org/grpc@v1.85.0-dev.0.20260825072537-93e31b48545e \
 && CGO_ENABLED=0 go build -trimpath -o /out/weed github.com/seaweedfs/seaweedfs/weed
COPY start.go /build/start.go
RUN CGO_ENABLED=0 go build -trimpath -o /out/start /build/start.go
FROM chrislusf/seaweedfs:4.46@sha256:08d516132314207d10c8e37cbffc1f32b147d870169688734cc61c6231625b62
COPY --from=build /out/weed /usr/bin/weed
COPY --from=build /out/start /usr/bin/start-athyper-storage
ENTRYPOINT ["/usr/bin/start-athyper-storage"]
RUN chown 1000:1000 /data
USER 1000:1000
