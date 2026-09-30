FROM golang:1.27.1-alpine@sha256:cf6fca6641884b8433441b2b0652976f975e1d0fdd26d177eaaf8596087f3125 AS probe
WORKDIR /src
COPY main.go main_test.go ./
RUN GO111MODULE=off go test -v . && CGO_ENABLED=0 GO111MODULE=off go build -trimpath -ldflags="-s -w" -o /out/readiness .

FROM grafana/loki:3.6.10@sha256:f59e6aedfee6af2388d69962b178a35a23152573b4bf0937106746deb7146ec7 AS loki
COPY --from=probe /out/readiness /usr/local/bin/readiness

FROM grafana/tempo:2.10.4@sha256:a6616c9d224770c883a67b50e4941e99c5df81b076ef05f516bb7cce5a96cec0 AS tempo
COPY --from=probe /out/readiness /usr/local/bin/readiness
