// Streamer
import { HashStreamer } from '@hash-stream/streamer'

// Index
import { IndexReader } from '@hash-stream/index/reader'
import { FSIndexStore } from '@hash-stream/index/store/fs'

// Pack
import { PackReader } from '@hash-stream/pack/reader'
import { FSPackStore } from '@hash-stream/pack/store/fs'

/**
 * @param {string} hashStreamPath - Path to the hash stream server stores
 */
export function getHashStreamer(hashStreamPath) {
  const indexStore = new FSIndexStore(`${hashStreamPath}/index`)
  const packStore = new FSPackStore(`${hashStreamPath}/pack`)

  const indexReader = new IndexReader(indexStore)
  const packReader = new PackReader(packStore)

  return new HashStreamer(indexReader, packReader)
}
