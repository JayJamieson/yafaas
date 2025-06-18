# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

yafaas (yet another function as a service) is a demonstration FaaS implementation using Docker containers as sandboxed runtime environments. The project consists of two main components:

- **API Server** (`api/`): Go-based HTTP API server that manages function lifecycle (create, list, delete) and event routing
- **Runtime** (`runtime/`): Node.js runtime environment that executes user functions within Docker containers

## Architecture

The system follows an event-driven architecture where:
1. API server builds Docker images for functions and manages containers
2. Runtime connects to the API server's event bus to receive function invocations
3. User functions are executed in isolated Node.js environments within containers

## Common Commands

### Building
- **Runtime**: `cd runtime && npm run build` - Compiles TypeScript runtime to JavaScript using esbuild
- **API**: `cd api && go build -o yafaas .` - Builds the Go API server binary
- **Docker image**: `docker build -t yafaas .` - Builds the complete system image

### Running
- **API Server**: `cd api && ./yafaas serve` - Starts HTTP server on localhost:9000
- **Docker**: `docker run --rm yafaas` - Runs the containerized system

### API Endpoints
- `POST /yafaas/functions` - Create new function (builds image + starts container)
- `GET /yafaas/functions` - List all running functions
- `DELETE /yafaas/functions/{id}` - Remove function container
- `POST /yafaas/events` - Send event to function runtime
- `GET /yafaas/events/next` - Runtime polling endpoint for new events

## Key Components

### API Server (`api/server/server.go`)
- Uses Docker client to build function images from uploaded code
- Manages EventBus for routing events between API and runtime
- Creates tar archives containing runtime + user function for Docker builds
- Maintains in-memory databases for logs, containers, and events

### Runtime (`runtime/src/`)
- `index.js`: Main entry point, loads user functions and starts event loop
- `client.js`: HTTP client for communicating with API server event endpoints  
- `runtime.js`: Executes user functions and handles responses/errors
- `functionLoader.js`: Dynamically loads user function modules

### Function Execution Flow
1. User code uploaded via POST /yafaas/functions
2. API builds Docker image with runtime + user function
3. Container started, runtime connects to event bus
4. Events sent to runtime via polling mechanism
5. Runtime executes user function and returns response

## Development Notes

- Runtime uses TypeScript but compiles to ESM modules
- API server uses chi router and Docker SDK for Go
- Function containers use Node.js 18.18-slim base image
- EVENTS_API environment variable connects runtime to API server
- User functions follow AWS Lambda handler pattern: `index.handler`