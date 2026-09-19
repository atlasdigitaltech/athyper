ARG KEYCLOAK_VERSION=26.7.3

FROM maven:3.9.11-eclipse-temurin-21@sha256:6fdc855a6ed81d288ca7ca37ac6ff5e9308b612485c0801d70b25a858c83d237 AS extension-build
ARG KEYCLOAK_VERSION
WORKDIR /build/iam-presentation-context
COPY extensions/iam-presentation-context/pom.xml ./pom.xml
COPY extensions/iam-presentation-context/src ./src
RUN mvn --batch-mode --no-transfer-progress \
    -Dkeycloak.version=${KEYCLOAK_VERSION} \
    clean verify

# Patch the complete Netty 4.1 module set together. Retain bootstrap filenames;
# JAR manifests and Maven metadata identify the actual patched versions.
COPY dependency-patches.txt /tmp/dependency-patches.txt
RUN mkdir /patched-jars && while read -r sha filename url; do \
      curl --fail --silent --show-error --location "$url" -o "/patched-jars/$filename" && \
      echo "$sha  /patched-jars/$filename" | sha256sum --check --strict || exit 1; \
    done < /tmp/dependency-patches.txt

FROM quay.io/keycloak/keycloak:${KEYCLOAK_VERSION}@sha256:ff4257d0d64efbe99ed1ddfaf07765cc3c36dc7518bf8324d41961327f441c54
COPY --chown=1000:0 --from=extension-build /patched-jars/ /opt/keycloak/lib/lib/main/
COPY --chown=1000:0 --from=extension-build \
    /build/iam-presentation-context/target/iam-presentation-context-0.1.0.jar \
    /opt/keycloak/providers/iam-presentation-context.jar
COPY realm-athyper-clean-slate.json /opt/keycloak/data/import/athyper-realm.json
COPY realm-platform-control-clean-slate.json /opt/keycloak/data/import/platform-control-realm.json
COPY themes /opt/keycloak/themes
# Provider timestamps must survive image-layer serialization unchanged.
ENV KC_DB=postgres KC_HEALTH_ENABLED=true
RUN touch -m --date=@1743465600 /opt/keycloak/providers/*.jar \
    && /opt/keycloak/bin/kc.sh build --db=postgres --health-enabled=true
