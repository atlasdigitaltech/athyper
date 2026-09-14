FROM apache/tika:4.0.0.0-full@sha256:80072bb73dd320a9de9709beb0b16d14dd6d2680376f8d31e498f55b633ba593
USER root
# The Ubuntu base includes Pebble, but Tika starts Java directly and never uses
# this Go supervisor. Removing it avoids maintaining an unused runtime binary.
RUN test -f /usr/bin/pebble && rm /usr/bin/pebble
USER 35002:35002
