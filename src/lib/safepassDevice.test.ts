// Pins the client PIN hash to the server's menumaker._safepass_pin_hash so a PIN
// verified offline on the kiosk matches what the RPC re-verifies on sync.
// Vector generated live from the DB:
//   select menumaker._safepass_pin_hash('881ef4ce-1a27-4d3b-aa60-59d2a307bf2b','1234')
import { describe, it, expect } from 'vitest'
import { pinHash } from './safepassDevice'

describe('pinHash (server parity)', () => {
  it('matches _safepass_pin_hash(center_id, pin) exactly', async () => {
    const h = await pinHash('881ef4ce-1a27-4d3b-aa60-59d2a307bf2b', '1234')
    expect(h).toBe('a1c542df6887f56dcdeed244985642a3ba51e8798dcad8600ef1d84c0f32e5c4')
  })

  it('is salted by center_id (same PIN, different center → different hash)', async () => {
    const a = await pinHash('881ef4ce-1a27-4d3b-aa60-59d2a307bf2b', '1234')
    const b = await pinHash('099c404b-e6d3-4543-9d9a-1fb11a2ee62d', '1234')
    expect(a).not.toBe(b)
  })
})
