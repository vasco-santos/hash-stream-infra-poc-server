# hash-stream-infra-poc-server

[Hash Stream](https://github.com/vasco-santos/hash-stream) infra deployment PoC for [hash-stream] built on a Node.js HTTP server with [Hono](https://hono.dev/).

## Getting Started

This repo contains a lightweight HTTP server that can be deployed to run an IPFS Trustless Gateway relying on [hash-stream].

This repo setup relies on the following Index and Pack stores in the file system:

- [`@hash-stream/index/store/fs`](https://github.com/vasco-santos/hash-stream/blob/main/packages/index/src/store/fs.js)
- [`@hash-stream/pack/store/fs`](https://github.com/vasco-santos/hash-stream/blob/main/packages/pack/src/store/fs.js)

The stores can easily be changed to target S3-like Cloud Object Storage like, AWS S3 and Cloudflare R2. See:

- [Index Stores](https://github.com/vasco-santos/hash-stream/tree/main/packages/index#stores)
- [Pack Stores](https://github.com/vasco-santos/hash-stream/tree/main/packages/pack#stores)

### Requirements

To work on this codebase, make sure you have:

- **Node.js >= v18** (production environment runs Node v18)
- A local or cloud-accessible path to the [hash-stream] data stores (packs and indexes)

### Development Server

To start a development/testing server:

```sh
$ npm run dev

> hash-stream-infra-poc-server@1.0.0 dev
> node src/index.js

Listening on http://localhost:3000
Hash Stream Stores Path: ~/.hash-stream-server
```

By default, the server listens on port `3000` and uses `~/.hash-stream-server` as the base path for packs and indexes. You can customize both using CLI flags.

---

### CLI Usage Options

You can run the server directly with the following optional arguments:

- `--port=<number>`: Port to run the HTTP server (default: `3000`)
- `--store-path=<path>`: Path to the `hash-stream` store (default: `~/.hash-stream-server`)

#### Examples

```sh
# Default usage
npm run dev

# Custom port
npm run dev -- --port=8080

# Custom hash-stream store path
npm run dev -- --store-path=/data/hash-stream

# Custom port and store path
npm run dev -- --port=4000 --store-path=/mnt/streamer-store
```

---

### Server Setup

The server exposes the following endpoint:

- `GET /ipfs/:cid` – Serves verifiable content associated with a multihash using the [hash-stream] building blocks under the hood.

The configured store path MUST contains valid `pack` and `index` data for it to respond to requests correctly.

---

## Deployment

For running a production-grade Node.js server, you can rely on tools such as:

### [PM2](https://pm2.io/)

Process manager with auto-restart and monitoring:

```sh
pm2 start src/index.js --name hash-stream-server -- --port=8080 --store-path=/mnt/data
```

### Docker

Containerize the server for portability and infra integration.

Dockerfile example:

```dockerfile
# Use Node.js base image
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of your code
COPY . .

# Expose the server port (adjust if needed)
EXPOSE 3000

# Start the app (adjust this to your actual start script if changed)
CMD ["node", "src/index.js"]
```

```sh
docker build -t hash-stream-server .
docker run -d --restart=always -p 8787:3000 hash-stream-server
```

A Docker image for this repository is available at https://hub.docker.com/r/vascosantos10/hash-stream-server

### Systemd

For bare-metal or traditional Linux deployments.

```ini
[Unit]
Description=Hash Stream Server
After=network.target

[Service]
ExecStart=/usr/bin/node /home/user/hash-stream/server.js --port=3000
Restart=on-failure
User=your-username
Environment=NODE_ENV=production
WorkingDirectory=/home/user/hash-stream

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reexec
sudo systemctl enable --now hash-stream
sudo journalctl -fu hash-stream
```

---

[hash-stream]: https://github.com/vasco-santos/hash-stream
