const BcRpcAgent = require('bcrpc')
const MongoClient = require('mongodb').MongoClient
const config = require('../config.json')

module.exports = class BlockParser {
    constructor (rpcHost, rpcPort, rpcUser, rpcPassword, sslEn, mongodbUrl, dbName) {
        this.bcrpc = new BcRpcAgent({
			host: rpcHost,
			port: rpcPort,
			user: rpcUser,
			pass: rpcPassword,
			ssl: sslEn 
		})
	    this.mongodbUrl = mongodbUrl
		this.dbName = dbName
	}

	async getBlockHashes (blockCount) {
        const hashes = []
        let hash
        for (let i = 0; i <= blockCount; i += 1) {
            try {
                hash = await this.bcrpc.getBlockHash(i)
            } catch (err) {
                throw Error(`getBlockHashes: getBlockHash failed. ${err}`)
            }
            hashes.push(hash)
        }
        return hashes
	}

	async parseVout (transaction, db) {
        db.collection('utxo').createIndex( { address: 1 } )
        for (let i = 0; i < transaction.vout.length; i += 1) {
            let utxo
            try {
                // TODO: for each vout in the tx, check if it is unspent (exists in gettxout)
                utxo = await this.bcrpc.getTxOut(transaction.txid, i)
                if (utxo === null) continue
            } catch (err) {
                throw Error(`parseVout: getTxOut failed. ${err}`)
            }
            const utxoEntry = {
                txid: transaction.txid,
                vout: i,
                value: parseFloat(utxo.value),
                address: utxo.scriptPubKey.addresses[0], // FIXME: This will only get the first address in a multisig output
                script: utxo.scriptPubKey.hex
            }

            try {
                if (config.debugEn) console.debug(`[BlockParser parseVout] saving utxo: ${JSON.stringify(utxoEntry)}`)
                await db.collection('utxo').insertOne(utxoEntry)
            } catch (err) {
                throw Error('utxo db insert: ' + err)
            }
        }
	}

	async parseTransactions (hashes, db) {
        let block
        let transactions
        for (let i = 0; i < hashes.length; i += 1) {
            try {
                block = await this.bcrpc.getBlock(hashes[i], 2)
                if (config.debugEn) console.debug(`[parseTransactions] got block ${hashes[i]}`)
            } catch (err) {
                throw Error(`parseTransactions: getBlock failed. ${err}`)
            }
            transactions = block.tx
            for (let j = 0; j < transactions.length; j += 1) {
                if (config.debugEn) console.debug('\x1b[36m', `[parseTransactions] tx found: ${JSON.stringify(transactions[j])}`, '\x1b[0m')
                // Skip genesis coinbase
                if (transactions[j].txid === '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b') continue
                await this.parseVout(transactions[j], db)
            }
        }
	}

	async parseBlocks () {
        let blockCount
        let hashes
        let client

        try {
            client = await MongoClient.connect(this.mongodbUrl)
        } catch (err) {
            throw Error('[BlockParser parseBlocks] Failed to connect to mongo', err)
        }
        if (config.debugEn) console.debug('[BlockParser parseBlocks] Connected successfully to mongo')
        try {
            blockCount = await this.bcrpc.getBlockCount()
        } catch (err) {
            throw Error(`getBlockCount error: ${err}`)
        }
        if (config.debugEn) console.debug(`[BlockParser parseBlocks] blockCount: ${blockCount}`)
        try {
            hashes = await this.getBlockHashes(blockCount)
        } catch (err) {
            throw Error(`getBlockHashes error: ${err}`)
        }
        if (config.debugEn) console.debug(`hashes: ${JSON.stringify(hashes)}`)
        try { 
            if (config.debugEn) console.debug(`[BlockParser parseBlocks] Attempting to connect to mongodb named: ${this.dbName}`)
            const db = client.db(this.dbName)
            // Check if exists first
            let collection_query_result = await db.command( { 'listCollections': 1, nameOnly: true })
            let collections = collection_query_result.cursor.firstBatch
            for (let i = 0; i < collections.length; i += 1) {
                if (collections[i].name === 'utxo') db.dropCollection('utxo')
            }
            if (config.debugEn) console.debug(`[BlockParser parseBlocks] Database clean complete: ${this.dbName}`)
        } catch (err) {
            throw Error(`[parseBlocks] Initialize Database ${err}`)
        }
    
        try {
            const db = client.db(this.dbName)
            if (config.debugEn) console.debug(`[BlockParser parseBlocks] Succesfully connected to mongodb: ${this.dbName}`)
            await this.parseTransactions(hashes, db)
            if (config.debugEn) console.debug(`[BlockParser parseBlocks] Transaction parsing complete.`)
            client.close()
        } catch (err) {
            throw Error(`[parseBlocks] parseTransactions ${err}`)
        }
    
    }
}
