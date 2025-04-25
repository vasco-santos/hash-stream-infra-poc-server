# hash-stream-infra-poc-server

Infra deployment PoC for [hash-stream] Server implementing the [IPFS Trustless Gateway](https://specs.ipfs.tech/http-gateways/trustless-gateway/) built on a Node.js HTTP server with [Hono](https://hono.dev/).

## Getting Started

This repo contains a lightweight HTTP server that can be deployed to run an [IPFS Trustless Gateway](https://specs.ipfs.tech/http-gateways/trustless-gateway/) relying on [hash-stream].

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

## Server Setup

The server exposes the following endpoint following the [IPFS Trustless Gateway Spec](https://specs.ipfs.tech/http-gateways/trustless-gateway/):

- `GET /ipfs/:cid` – Serves verifiable content associated with a multihash using the [hash-stream] building Blobs under the hood.

The configured store path MUST contains valid `pack` and `index` data for it to respond to requests correctly.

### ⚙️ Query Parameters & Headers

The request **must specify the desired response format** using one of:

#### ✅ Accept Header (preferred)

```http
Accept: application/vnd.ipld.raw
Accept: application/vnd.ipld.car
```

#### ✅ `format` Query Parameter (optional alternative)

```http
/ipfs/:cid?format=raw
/ipfs/:cid?format=car
```

Supported formats:

| Format | Description                             |
| ------ | --------------------------------------- |
| `raw`  | Outputs the raw block bytes             |
| `car`  | Outputs a CAR file containing the block |

> Note: For compatibility, requests **without a valid format header or query param will be rejected or return an empty response**.

---

### 🚀 Example Request

```bash
curl -i -H "Accept: application/vnd.ipld.raw" http://localhost:3000/ipfs/bafkqaaa
```

or

```bash
curl -i "http://localhost:3000/ipfs/bafkqaaa?format=raw"
```

---

## Fetch and verify content

This Server exposes an HTTP route `/ipfs` as a [Trustless Gateway](https://specs.ipfs.tech/http-gateways/trustless-gateway/), only resolving content that can be verified on the client. While a user has the responsability to verify and decode the content on the client side, there are some clients available that can be used, such as [@helia/verified-fetch](https://github.com/ipfs/helia-verified-fetch/tree/main/packages/verified-fetch).

Here follows an example using `@helia/verified-fetch` to fetch some content:

```js
import fs from 'fs'

import { createVerifiedFetch } from '@helia/verified-fetch'
import { CID } from 'multiformats/cid'

const cidString = 'bafybeiaxbrtsdhi4n2qv53wskm7s6dcr3wpxy7kqdcjp2tx2dafxeiqu2m'
const cid = CID.parse(cidString)

// Example server URL deployed
const serverUrl = 'https://my-hash-stream-server.dev'
const verifiedFetch = await createVerifiedFetch({
  gateways: [serverUrl],
})
const response = await verifiedFetch(`ipfs://${cid}/`)
const body = await response.arrayBuffer()
const bodyBytes = new Uint8Array(body)

// Write fetched file to disk
await fs.promises.writeFile(`./${cid.toString()}`, Buffer.from(bodyBytes))

await verifiedFetch.stop()
```

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
