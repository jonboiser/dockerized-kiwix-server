FROM ubuntu:focal
RUN apt-get update
RUN apt-get install -y wget
VOLUME /zims
WORKDIR /
COPY ./scripts ./scripts
RUN ./scripts/provision.sh
RUN useradd -r -m kiwix && touch /library.xml && chown kiwix:kiwix /library.xml
USER kiwix
EXPOSE 8080
ENTRYPOINT ["./scripts/entrypoint.sh"]
