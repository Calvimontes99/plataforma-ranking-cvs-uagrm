FROM maven:3.9.9-eclipse-temurin-21-jammy AS build
WORKDIR /workspace
COPY proto /workspace/proto
COPY services/ms-vacantes/pom.xml /workspace/services/ms-vacantes/pom.xml
WORKDIR /workspace/services/ms-vacantes
RUN mvn -B -DskipTests dependency:go-offline \
    && mvn -B dependency:get -Dartifact=io.grpc:protoc-gen-grpc-java:1.68.1:exe:linux-x86_64 \
    && find /root/.m2/repository/io/grpc/protoc-gen-grpc-java \
       -type f -name '*linux-x86_64.exe' -exec chmod 755 {} \;
COPY services/ms-vacantes/src ./src
RUN mvn -B -DskipTests package

FROM eclipse-temurin:21-jre-jammy
RUN groupadd --system spring && useradd --system --gid spring --create-home spring
USER spring:spring
WORKDIR /app
COPY --from=build /workspace/services/ms-vacantes/target/ms-vacantes-*.jar app.jar
EXPOSE 8080 9090
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-jar", "/app/app.jar"]
