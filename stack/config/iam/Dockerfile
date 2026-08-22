ARG KEYCLOAK_VERSION=26.7.2

FROM maven:3.9.11-eclipse-temurin-21@sha256:6fdc855a6ed81d288ca7ca37ac6ff5e9308b612485c0801d70b25a858c83d237 AS extension-build
ARG KEYCLOAK_VERSION
WORKDIR /build/iam-presentation-context
COPY extensions/iam-presentation-context/pom.xml ./pom.xml
COPY extensions/iam-presentation-context/src ./src
RUN mvn --batch-mode --no-transfer-progress \
    -Dkeycloak.version=${KEYCLOAK_VERSION} \
    clean verify

FROM quay.io/keycloak/keycloak:${KEYCLOAK_VERSION}@sha256:831330513f55695572286e521f94fcd3c7e285250ed5b848090265a33192f669
COPY --from=extension-build \
    /build/iam-presentation-context/target/iam-presentation-context-0.1.0.jar \
    /opt/keycloak/providers/iam-presentation-context.jar
COPY realm-athyper-clean-slate.json /opt/keycloak/data/import/athyper-realm.json
COPY realm-platform-control-clean-slate.json /opt/keycloak/data/import/platform-control-realm.json
COPY themes /opt/keycloak/themes
RUN /opt/keycloak/bin/kc.sh build --db=postgres
