# MyPlatform API — PMD, SpotBugs, JDK 8, Maven, Playwright
# Render: Dockerfile Path = docker/source-scan/Dockerfile, Docker Context = .

FROM eclipse-temurin:8-jdk-jammy

ENV DEBIAN_FRONTEND=noninteractive \
    PMD_HOME=/opt/pmd \
    PMD_BIN=/opt/pmd/bin/pmd \
    SPOTBUGS_HOME=/opt/spotbugs \
    SPOTBUGS_BIN=/opt/spotbugs/bin/spotbugs \
    SPOTBUGS_JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64 \
    MAVEN_HOME=/opt/maven \
    FINDSEC_BUGS_PLUGIN_JAR=/opt/findsecbugs-plugin.jar \
    SOURCE_SCAN_TOOLS_DIR=/opt \
    PORT=10000 \
    PATH="/opt/maven/bin:/opt/pmd/bin:/opt/spotbugs/bin:${PATH}"

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl unzip python3 python3-pip python3-venv \
    openjdk-11-jre-headless \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libdbus-1-3 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
    libpango-1.0-0 libcairo2 libatspi2.0-0 libxshmfence1 \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

ARG MAVEN_VERSION=3.9.6
RUN curl -fsSL "https://archive.apache.org/dist/maven/maven-3/${MAVEN_VERSION}/binaries/apache-maven-${MAVEN_VERSION}-bin.tar.gz" \
    | tar -xzC /opt \
    && mv "/opt/apache-maven-${MAVEN_VERSION}" /opt/maven

ARG PMD_VERSION=7.26.0
RUN curl -fsSL "https://github.com/pmd/pmd/releases/download/pmd_releases%2F${PMD_VERSION}/pmd-dist-${PMD_VERSION}-bin.zip" -o /tmp/pmd.zip \
    && unzip -q /tmp/pmd.zip -d /opt \
    && mv /opt/pmd-bin-${PMD_VERSION} /opt/pmd \
    && rm /tmp/pmd.zip

ARG SPOTBUGS_VERSION=4.10.4
RUN curl -fsSL "https://github.com/spotbugs/spotbugs/releases/download/${SPOTBUGS_VERSION}/spotbugs-${SPOTBUGS_VERSION}.zip" -o /tmp/sb.zip \
    && unzip -q /tmp/sb.zip -d /opt \
    && mv /opt/spotbugs-${SPOTBUGS_VERSION} /opt/spotbugs \
    && rm /tmp/sb.zip

ARG FINDSEC_VERSION=1.14.0
RUN curl -fsSL "https://repo1.maven.org/maven2/com/h3xstream/findsecbugs/findsecbugs-plugin/${FINDSEC_VERSION}/findsecbugs-plugin-${FINDSEC_VERSION}.jar" \
    -o /opt/findsecbugs-plugin.jar

WORKDIR /app
COPY apps/api/requirements.txt /app/apps/api/requirements.txt
RUN pip3 install --no-cache-dir -r /app/apps/api/requirements.txt \
    && pip3 install --no-cache-dir playwright \
    && python3 -m playwright install chromium

COPY apps/api /app/apps/api
COPY apps/portal /app/apps/portal
COPY package.json /app/package.json

WORKDIR /app/apps/api
EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["sh", "-c", "python3 -m uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
