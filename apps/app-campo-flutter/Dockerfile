FROM ghcr.io/cirruslabs/flutter:3.24.5 AS verify
WORKDIR /app
COPY apps/app-campo-flutter/pubspec.yaml ./
RUN flutter pub get
COPY apps/app-campo-flutter .
RUN flutter analyze
