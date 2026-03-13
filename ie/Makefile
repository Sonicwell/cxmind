
# Go Ingestion Service Makefile

BINARY_NAME=ingestion-service
DOCKER_IMAGE=sip-ai/ingestion

all: build

build:
	CGO_ENABLED=1 go build -o $(BINARY_NAME) .

build-prod:
	CGO_ENABLED=1 go build -ldflags="-s -w -X github.com/cxmind/ingestion-go/internal/config.BuildMode=production" -o $(BINARY_NAME) .

build-linux:
	CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build -o $(BINARY_NAME)-linux .

build-linux-prod:
	CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w -X github.com/cxmind/ingestion-go/internal/config.BuildMode=production" -o $(BINARY_NAME)-linux .

docker-build:
	docker build -t $(DOCKER_IMAGE) .

run:
	./$(BINARY_NAME)

clean:
	go clean
	rm -f $(BINARY_NAME)
	rm -f $(BINARY_NAME)-linux
