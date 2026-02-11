
FROM public.ecr.aws/docker/library/python:3.13-slim


WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --upgrade pip && \
    pip install --no-cache-dir \
      --disable-pip-version-check \
      --prefer-binary \
      -r requirements.txt

COPY . .

RUN useradd -m -u 1000 bedrock_agentcore
RUN chown -R bedrock_agentcore:bedrock_agentcore /app
USER bedrock_agentcore

EXPOSE 8080
EXPOSE 8000

CMD ["opentelemetry-instrument", "python", "-m", "agent"]