FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates wget \
    && rm -rf /var/lib/apt/lists/*
VOLUME /zims
WORKDIR /
COPY ./scripts ./scripts
RUN ./scripts/provision.sh
RUN useradd -r -m kiwix
USER kiwix
EXPOSE 8080
ENTRYPOINT ["./scripts/entrypoint.sh"]
