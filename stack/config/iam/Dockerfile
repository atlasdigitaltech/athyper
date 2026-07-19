ARG KEYCLOAK_VERSION=26.6.1

FROM maven:3.9.11-eclipse-temurin-21 AS extension-build
ARG KEYCLOAK_VERSION
WORKDIR /build/iam-presentation-context
COPY extensions/iam-presentation-context/pom.xml ./pom.xml
COPY extensions/iam-presentation-context/src ./src
RUN mvn --batch-mode --no-transfer-progress \
    -Dkeycloak.version=${KEYCLOAK_VERSION} \
    clean verify

FROM quay.io/keycloak/keycloak:${KEYCLOAK_VERSION}
COPY --from=extension-build \
    /build/iam-presentation-context/target/iam-presentation-context-0.1.0.jar \
    /opt/keycloak/providers/iam-presentation-context.jar
RUN /opt/keycloak/bin/kc.sh build --db=postgres
