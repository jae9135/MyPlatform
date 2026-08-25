# Source Scan API — PMD, SpotBugs, JDK 8, Maven
# Build: docker build -f docker/source-scan/Dockerfile -t myplatform-api-source-scan .
# Run:   docker run --rm -p 8001:8001 -e PMD_HOME=/opt/pmd -e SPOTBUGS_HOME=/opt/spotbugs myplatform-api-source-scan

FROM eclipse-temurin:8-jdk-jammy

ENV DEBIAN_FRONTEND=noninteractive \
    PMD_HOME=/opt/pmd \
    SPOTBUGS_HOME=/opt/spotbugs \
    MAVEN_HOME=/opt/maven \
    PATH="/opt/maven/bin:/opt/pmd/bin:/opt/spotbugs/bin:${PATH}"

RUN apt-get update && apt-get install -y --no-install-recommends curl unzip python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Maven
ARG MAVEN_VERSION=3.9.6
RUN curl -fsSL "https://archive.apache.org/dist/maven/maven-3/${MAVEN_VERSION}/binaries/apache-maven-${MAVEN_VERSION}-bin.tar.gz" \
    | tar -xzC /opt \
    && mv "/opt/apache-maven-${MAVEN_VERSION}" /opt/maven

# PMD
ARG PMD_VERSION=7.26.0
RUN curl -fsSL "https://github.com/pmd/pmd/releases/download/pmd_releases%2F${PMD_VERSION}/pmd-dist-${PMD_VERSION}-bin.zip" -o /tmp/pmd.zip \
    && unzip -q /tmp/pmd.zip -d /opt \
    && mv /opt/pmd-bin-${PMD_VERSION} /opt/pmd \
    && rm /tmp/pmd.zip

# SpotBugs + findsecbugs plugin
ARG SPOTBUGS_VERSION=4.10.4
ARG FINDSEC_VERSION=1.14.0
RUN curl -fsSL "https://github.com/spotbugs/spotbugs/releases/download/${SPOTBUGS_VERSION}/spotbugs-${SPOTBUGS_VERSION}.zip" -o /tmp/sb.zip \
    && unzip -q /tmp/sb.zip -d /opt \
    && mv /opt/spotbugs-${SPOTBUGS_VERSION} /opt/spotbugs \
    && curl -fsSL "https://github.com/find-sec-bugs/find-sec-bugs/releases/download/version-${FINDSEC_VERSION}/findsecbugs-plugin-${FINDSEC_VERSION}.jar" \
       -o /opt/findsecbugs-plugin.jar \
    && rm /tmp/sb.zip

ENV FINDSEC_BUGS_PLUGIN_JAR=/opt/findsecbugs-plugin.jar

WORKDIR /app
COPY apps/api/requirements.txt /app/apps/api/requirements.txt
RUN pip3 install --no-cache-dir -r /app/apps/api/requirements.txt

COPY apps/api /app/apps/api
COPY package.json /app/package.json

WORKDIR /app/apps/api
EXPOSE 8001
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
