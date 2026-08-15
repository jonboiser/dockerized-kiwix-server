FROM python:3-alpine

WORKDIR /app
COPY server.py .

ENV ZIMDIR=/zims \
    PORT=3000

EXPOSE 3000
CMD ["python", "server.py"]
