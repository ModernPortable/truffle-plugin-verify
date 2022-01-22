const verifyOnEtherscan = require('./etherscan/verify')
const logger = require('./common/logger')
const { getArtifact, enforce, abort } = require('./common/util')
const { version } = require('../package.json')

module.exports = async (config) => {
  if (config.debug) logger.level('debug')
  logger.debug('DEBUG logging is turned ON')
  logger.debug(`Running truffle-plugin-verify v${version}`)

  enforce(config._.length > 1, 'No contract name(s) specified')

  // Verify each contract
  const contractNameAddressPairs = config._.slice(1)

  // Track which contracts failed verification
  const failedContracts = []

  for (const contractNameAddressPair of contractNameAddressPairs) {
    logger.info(`Verifying ${contractNameAddressPair}`)
    try {
      const [contractName, contractAddress] = contractNameAddressPair.split('@')

      const artifact = getArtifact(contractName, config.contracts_build_directory)

      // Add custom address override to the artifact
      if (contractAddress) {
        logger.debug(`Custom address ${contractAddress} specified`)
        if (!artifact.networks[`${config.network_id}`]) {
          artifact.networks[`${config.network_id}`] = {}
        }
        artifact.networks[`${config.network_id}`].address = contractAddress
      }

      const result = await verifyContract(artifact, config)

      if (result.error) {
        failedContracts.push(`${contractNameAddressPair}`)
      } else if (result.explorerUrl) {
        result.status = `${result.status}: ${result.explorerUrl}`
      }

      logger.info(result.status)
    } catch (error) {
      logger.error(error.message)
      failedContracts.push(contractNameAddressPair)
    }
    logger.info()
  }

  enforce(
    failedContracts.length === 0,
    `Failed to verify ${failedContracts.length} contract(s): ${failedContracts.join(', ')}`
  )

  logger.info(`Successfully verified ${contractNameAddressPairs.length} contract(s).`)
}

const verifyContract = async (artifact, config) => {
  if (config.sourcify) {
    abort('TODO: Implement sourcify verification')
  } else if (config.blockscout) {
    abort('TODO: Implement blockscout verification')
  } else {
    // Default is verification on Etherscan / BscScan
    return verifyOnEtherscan(artifact, config)
  }
}
