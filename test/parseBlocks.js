const BlockParser = require('../index.js')
const expect = require('chai').use(require('chai-bytes')).expect

let config = {
    rpcUrl: "127.0.0.1",
    rpcPort: "18443",
    rpcUser: "jbaczuk",
    rpcPassword: "parcel-adoptive-grunt",
    rpcSslEn: false,
    mongoDbUrl: 'mongodb://localhost:27017',
    dbName: 'bitcoin_regtest',
    debugEn: false
}

describe('parseBlock Tests', () => {
    it('added all blocks to database', async () => {
        let blockParser = new BlockParser(config.rpcUrl, config.rpcPort, config.rpcUser, config.rpcPassword, config.rpcSslEn, config.mongoDbUrl, config.dbName, config.debugEn)
        blockParser.resetDatabase()
        
        try {
            await blockParser.parseBlocks()
        } catch (err) {
            throw Error(`[parseBlock] parseBlocks failed ${err}`)
        }
    })
})

