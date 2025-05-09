import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { http } from '@hash-stream/utils/trustless-ipfs-gateway'

import { getHashStreamer } from './lib.js'

// Parse CLI args
const args = process.argv.slice(2)

const portArg = args.find((arg) => arg.startsWith('--port='))
const port = portArg ? parseInt(portArg.split('=')[1], 10) : 3000

const pathArg = args.find((arg) => arg.startsWith('--store-path='))
const hashStreamPath = pathArg ? pathArg.split('=')[1] : '~/.hash-stream-server'

const app = createApp(hashStreamPath).app

if (process.env.NODE_ENV !== 'test') {
  serve(
    {
      fetch: app.fetch,
      port,
      hostname: '0.0.0.0',
    },
    (info) => {
      console.log(`Listening on http://localhost:${info.port}`) // Listening on http://localhost:3000
      console.log(`Hash Stream Stores Path: ${hashStreamPath}`)
    }
  )
}

/**
 * Creates a Hono app configured with a specific hash stream path
 * @param {string} hashStreamPath
 * @returns {{ app: Hono, hashStreamPath: string }}
 */
export function createApp(hashStreamPath) {
  const app = new Hono()

  app.get('/ipfs/:cid', async (c) => {
    const hashStreamer = getHashStreamer(hashStreamPath)
    return http.ipfsGet(c.req.raw, { hashStreamer })
  })

  return { app, hashStreamPath }
}
