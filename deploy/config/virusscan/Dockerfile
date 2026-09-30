# Narrow ClamAV 1.5.2 engine correction; retain the upstream daemon/update entrypoint.
FROM clamav/clamav:1.5.2@sha256:1b6443c4a7b456baa1abfaf9796815f8d21e2fb558dbaed5b682fd4552d8b0c3 AS build
USER root
RUN apk add --no-cache build-base cmake ninja cargo rust clang-dev llvm-dev openssl-dev \
    libxml2-dev json-c-dev pcre2-dev bzip2-dev zlib-dev curl-dev linux-headers python3 patch
WORKDIR /source
ADD https://codeload.github.com/Cisco-Talos/clamav/tar.gz/refs/tags/clamav-1.5.2 /source/clamav.tar.gz
RUN echo '26815066815ef974fd778be6ab431064f32110199e3b6f89f32a6d3c492fe730  clamav.tar.gz' | sha256sum -c - \
    && tar -xzf clamav.tar.gz --strip-components=1
COPY zip-limit-alert.patch /source/zip-limit-alert.patch
RUN patch -p1 < zip-limit-alert.patch
RUN cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release \
    -DENABLE_LIBCLAMAV_ONLY=ON -DENABLE_TESTS=OFF -DENABLE_MAN_PAGES=OFF \
    -DENABLE_STATIC_LIB=OFF -DCMAKE_INSTALL_PREFIX=/usr \
    -DAPP_CONFIG_DIRECTORY=/etc/clamav -DCVD_CERTS_DIRECTORY=/etc/clamav/certs \
    && cmake --build build --target clamav -j 4

FROM clamav/clamav:1.5.2@sha256:1b6443c4a7b456baa1abfaf9796815f8d21e2fb558dbaed5b682fd4552d8b0c3
RUN apk upgrade --no-cache
COPY --from=build /source/build/libclamav/libclamav.so.12.1.0 /usr/lib/libclamav.so.12.1.0
LABEL org.athyper.virusscan.patch="zip-limit-alert-1"
