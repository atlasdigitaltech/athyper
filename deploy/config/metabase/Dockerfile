FROM metabase/metabase:v0.51.10@sha256:5af4877f1c7c6b7c2b6504a5302acfdef593ec5a780962d8d13f2cc3b50104a7
# Create the account at build time, avoiding upstream's mutable root bootstrap.
RUN addgroup -S -g 2000 metabase \
 && adduser -S -D -H -u 2000 -G metabase metabase \
 && chmod a+r /app/metabase.jar
