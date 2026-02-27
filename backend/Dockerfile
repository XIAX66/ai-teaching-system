# Build Stage
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache gcc musl-dev

# Copy go mod and sum files
COPY go.mod go.sum ./
RUN go mod download

# Copy the source code
COPY . .

# Build the application
RUN go build -o main cmd/server/main.go

# Final Stage
FROM alpine:3.18

WORKDIR /app

# Install Python and pip for PDF parsing
RUN apk add --no-cache python3 py3-pip

# Create and sync python environment (installing pdfplumber directly)
RUN python3 -m venv /app/venv
RUN /app/venv/bin/pip install --no-cache-dir pdfplumber -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com

# Copy the built binary and necessary scripts
COPY --from=builder /app/main .
COPY --from=builder /app/scripts ./scripts

# Create uploads directory
RUN mkdir -p uploads/textbooks uploads/resources

# Expose port
EXPOSE 8080

# Run the application
CMD ["./main"]
