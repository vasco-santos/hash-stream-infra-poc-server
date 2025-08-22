import assert from 'assert'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { once } from 'node:events'
import { serve } from '@hono/node-server'
import all from 'it-all'
import { equals } from 'uint8arrays/equals'

import { SingleLevelIndexWriter } from '@hash-stream/index'
import { MultipleLevelIndexWriter } from '@hash-stream/index'
import { FSIndexStore } from '@hash-stream/index/store/fs'
import { PackWriter } from '@hash-stream/pack'
import { FSPackStore } from '@hash-stream/pack/store/fs'

import { CarReader } from '@ipld/car'
import { base58btc } from 'multiformats/bases/base58'
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import { code as RawCode } from 'multiformats/codecs/raw'
import { recursive as exporter } from 'ipfs-unixfs-exporter'
import { createVerifiedFetch } from '@helia/verified-fetch'

import { createApp } from '../src/index.js'
import { randomBytes } from './helpers/random.js'

const identityCidString = 'bafkqaaa'
const dagPbCode = 0x70

describe('HashStream server with client', () => {
  /** @type {import('hono').Hono} */
  let app
  let server
  let providerUrl
  let baseUrl
  let hashStreamPath
  let verifiedFetch
  /** @type {PackWriter} */
  let packWriter

  before(async () => {
    hashStreamPath = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-pack-test-'))
    fs.mkdirSync(`${hashStreamPath}/pack`, { recursive: true })
    fs.mkdirSync(`${hashStreamPath}/index`, { recursive: true })

    app = createApp(hashStreamPath).app

    // Create a Hono server
    server = serve(
      {
        fetch: app.fetch,
        port: 8787,
        hostname: '0.0.0.0',
      },
      (info) => {
        console.log(`Listening on http://localhost:${info.port}`) // Listening on http://localhost:3000
        console.log(`Hash Stream Stores Path: ${hashStreamPath}`)
      }
    )

    await once(server, 'listening')

    // @ts-expect-error types do not match
    const port = server.address().port
    providerUrl = `/ip4/127.0.0.1/tcp/${port}/http`
    baseUrl = `http://127.0.0.1:${port}`

    verifiedFetch = await createVerifiedFetch({
      gateways: [baseUrl],
      allowLocal: true,
    })

    // Create a pack writer
    const indexStore = new FSIndexStore(`${hashStreamPath}/index`)
    const multipleLevelindexWriter = new MultipleLevelIndexWriter(indexStore)
    const singleLevelIndexWriter = new SingleLevelIndexWriter(indexStore)
    const packStore = new FSPackStore(`${hashStreamPath}/pack`)
    packWriter = new PackWriter(packStore, {
      indexWriters: [singleLevelIndexWriter, multipleLevelindexWriter],
    })
  })

  after(async () => {
    if (fs.existsSync(hashStreamPath)) {
      fs.rmSync(hashStreamPath, { recursive: true, force: true })
    }
    await verifiedFetch.stop()
    await new Promise((resolve) => {
      server.close(resolve)
    })
  })

  it('responds to GET /ipfs/:cid with identity CID as RAW', async () => {
    const res = await app.request(`/ipfs/${identityCidString}`, {
      method: 'GET',
      headers: {
        accept: 'application/vnd.ipld.raw',
      },
    })
    assert(res.status === 200)
  })

  it('responds to GET /ipfs/:cid with identity CID as CAR', async () => {
    const res = await app.request(`/ipfs/${identityCidString}`, {
      method: 'GET',
      headers: {
        accept: 'application/vnd.ipld.car',
      },
    })
    assert(res.status === 200)
  })

  it('returns 404 for non-existent CID', async () => {
    const nonExistentCid =
      'bafkreidfmitzyypu3hdxglewmfiqcies67dosbgepnpudwnydlr67kkgri'
    const regularResponseRaw = await app.request(`/ipfs/${nonExistentCid}`, {
      method: 'GET',
      headers: {
        accept: 'application/vnd.ipld.raw',
      },
    })
    assert(regularResponseRaw.status === 404)

    const regularResponseCar = await app.request(`/ipfs/${nonExistentCid}`, {
      method: 'GET',
      headers: {
        accept: 'application/vnd.ipld.car',
      },
    })
    assert(regularResponseCar.status === 404)

    // const verifiedFetchResponse = await verifiedFetch(
    //   `ipfs://${nonExistentCid}/`
    // )
    // assert(verifiedFetchResponse.status === 404)
  })

  it('handles verified fetch requests for identity CID', async () => {
    const verifiedFetchResponse = await verifiedFetch(
      `ipfs://${identityCidString}/`
    )
    assert(verifiedFetchResponse.status === 200)
    const verifiedFetchBody = await verifiedFetchResponse.arrayBuffer()
    const verifiedFetchbodyBytes = new Uint8Array(verifiedFetchBody)
    assert(verifiedFetchbodyBytes.byteLength === 0)

    const regularResponse = await app.request(`/ipfs/${identityCidString}`, {
      method: 'GET',
      headers: {
        accept: 'application/vnd.ipld.raw',
      },
    })
    assert(regularResponse.status === 200)
    const regularBody = await regularResponse.arrayBuffer()
    const regularBodyBytes = new Uint8Array(regularBody)
    assert(verifiedFetchbodyBytes.byteLength === regularBodyBytes.byteLength)
  })

  it('handles verified fetch requests for non sharded content traversing the DAG by its containing multihash CID', async () => {
    // Create non sharded content
    const byteLength = 5_000_000
    const bytes = await randomBytes(byteLength)
    const blob = new Blob([bytes])
    const createPackOptions = {
      type: /** @type {'car'} */ ('car'),
    }
    // Write piece of content to pack store
    const { containingMultihash } = await packWriter.write(
      blob,
      createPackOptions
    )
    const containingCid = CID.createV1(dagPbCode, containingMultihash)

    // Fetch the content using the regular fetch as a CAR
    // and transform the content
    const regularResponse = await app.request(
      `/ipfs/${containingCid.toString()}`,
      {
        method: 'GET',
        headers: {
          accept: 'application/vnd.ipld.car',
        },
      }
    )
    assert(regularResponse.status === 200)

    // Transform the content into unixfs content like given by the verified fetch
    const regularBody = await regularResponse.arrayBuffer()
    const regularBodyBytes = new Uint8Array(regularBody)
    const readerBlockStore = await CarReader.fromBytes(regularBodyBytes)
    const roots = await readerBlockStore.getRoots()
    const entries = exporter(roots[0], {
      async get(cid) {
        const block = await readerBlockStore.get(cid)
        if (!block) {
          throw new Error(`Block not found in exported content: ${cid}`)
        }
        return block.bytes
      },
    })
    const fileEntries = await all(entries)
    const file = fileEntries[0]
    const collectedFileChunks = await all(file.content())
    const writtenContentBytes = getBytesFromChunckedBytes(collectedFileChunks)

    // Fetch the content using verified fetch
    const verifiedFetchResponse = await verifiedFetch(
      `ipfs://${containingCid}/?provider=${providerUrl}`,
      {
        allowProviderParameter: true,
        allowLocal: true,
      }
    )
    assert(verifiedFetchResponse.status === 200)
    const verifiedFetchBody = await verifiedFetchResponse.arrayBuffer()
    const verifiedFetchbodyBytes = new Uint8Array(verifiedFetchBody)

    // Content retrieved via direct car download and verified fetch is the same:
    assert(equals(verifiedFetchbodyBytes, writtenContentBytes))
    assert(equals(verifiedFetchbodyBytes, bytes))
  })

  it('handles verified fetch requests for sharded content traversing the DAG by its containing multihash CID', async () => {
    // Create sharded content
    const byteLength = 10_000_000
    const shardSize = byteLength / 2
    const bytes = await randomBytes(byteLength)
    const blob = new Blob([bytes])
    const createPackOptions = {
      shardSize,
      type: /** @type {'car'} */ ('car'),
    }
    // Write piece of content to pack store
    const { containingMultihash, packsMultihashes } = await packWriter.write(
      blob,
      createPackOptions
    )
    assert(packsMultihashes.length === 3)

    const containingCid = CID.createV1(dagPbCode, containingMultihash)

    // Fetch the content using the regular fetch as a CAR
    // and transform the content
    const regularResponse = await app.request(
      `/ipfs/${containingCid.toString()}`,
      {
        method: 'GET',
        headers: {
          accept: 'application/vnd.ipld.car',
        },
      }
    )
    assert(regularResponse.status === 200)

    // Transform the content into unixfs content like given by the verified fetch
    const regularBody = await regularResponse.arrayBuffer()
    const regularBodyBytes = new Uint8Array(regularBody)
    const readerBlockStore = await CarReader.fromBytes(regularBodyBytes)
    const roots = await readerBlockStore.getRoots()
    const entries = exporter(roots[0], {
      async get(cid) {
        const block = await readerBlockStore.get(cid)
        if (!block) {
          throw new Error(`Block not found in exported content: ${cid}`)
        }
        return block.bytes
      },
    })
    const fileEntries = await all(entries)
    const file = fileEntries[0]
    const collectedFileChunks = await all(file.content())
    const writtenContentBytes = getBytesFromChunckedBytes(collectedFileChunks)

    // Fetch the content using verified fetch
    const verifiedFetchResponse = await verifiedFetch(
      `ipfs://${containingCid}/?provider=${providerUrl}`,
      {
        allowProviderParameter: true,
        allowLocal: true,
      }
    )
    assert(verifiedFetchResponse.status === 200)
    const verifiedFetchBody = await verifiedFetchResponse.arrayBuffer()
    const verifiedFetchbodyBytes = new Uint8Array(verifiedFetchBody)

    // Content retrieved via direct car download and verified fetch is the same:
    assert(equals(verifiedFetchbodyBytes, writtenContentBytes))
    assert(equals(verifiedFetchbodyBytes, bytes))
  })

  it('handles verified fetch requests for non containing blobs by their multihash CID', async () => {
    // Create sharded content
    const byteLength = 5_000_000
    const bytes = await randomBytes(byteLength)
    const blob = new Blob([bytes])
    /** @type {Map<string, import('multiformats').MultihashDigest[]>} */
    const packBlobsMap = new Map()
    const createPackOptions = {
      type: /** @type {'car'} */ ('car'),
      /**
       * @type {import('@hash-stream/pack/types').PackWriterWriteOptions['onPackWrite']}
       */
      onPackWrite: (packMultihash, blobMultihashes) => {
        const encodedPackMultihash = base58btc.encode(packMultihash.bytes)
        packBlobsMap.set(encodedPackMultihash, blobMultihashes)
      },
    }
    // Write piece of content to pack store
    const { containingMultihash, packsMultihashes } = await packWriter.write(
      blob,
      createPackOptions
    )
    assert(packsMultihashes.length === 1)

    for (const blobMultihash of packBlobsMap.get(
      base58btc.encode(packsMultihashes[0].bytes)
    ) || []) {
      const blobCid = CID.createV1(RawCode, blobMultihash)

      // Fetch the content using the regular fetch as a RAW
      const regularResponse = await app.request(`/ipfs/${blobCid.toString()}`, {
        method: 'GET',
        headers: {
          accept: 'application/vnd.ipld.raw',
        },
      })
      assert(regularResponse.status === 200)
      const regularBody = await regularResponse.arrayBuffer()
      const regularBodyBytes = new Uint8Array(regularBody)

      // Verify fetched content hashes to the multihash
      const blobMultihashFromBytes = await sha256.digest(regularBodyBytes)
      assert(equals(blobMultihash.bytes, blobMultihashFromBytes.bytes))

      // Fetch the content using verified fetch
      const verifiedFetchResponse = await verifiedFetch(`ipfs://${blobCid}/?provider=${providerUrl}`, {
        allowProviderParameter: true,
        allowLocal: true,
      })
      assert(verifiedFetchResponse.status === 200)
      const verifiedFetchBody = await verifiedFetchResponse.arrayBuffer()
      const verifiedFetchbodyBytes = new Uint8Array(verifiedFetchBody)
      assert(equals(verifiedFetchbodyBytes, regularBodyBytes))
      assert(regularBodyBytes.byteLength === verifiedFetchbodyBytes.byteLength)

      // Make sure it is not equal to the entire content as it is just a blob
      assert(!equals(verifiedFetchbodyBytes, bytes))
    }
  })
})

/**
 *
 * @param {Uint8Array[]} chunks
 */
function getBytesFromChunckedBytes(chunks) {
  const totalSize = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
  const writtenCarBytes = new Uint8Array(totalSize)
  let offset = 0
  for (const chunk of chunks) {
    writtenCarBytes.set(chunk, offset)
    offset += chunk.length
  }
  return writtenCarBytes
}
