FROM ubuntu:focal
RUN apt-get update
RUN apt-get install -y wget
VOLUME /zims
WORKDIR /
COPY ./scripts ./scripts
RUN ./scripts/provision.sh
RUN useradd -r -m kiwix
USER kiwix
EXPOSE 8080
ENTRYPOINT ["./scripts/entrypoint.sh"]
