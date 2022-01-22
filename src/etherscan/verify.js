const axios = require('axios').default
const delay = require('delay')
const querystring = require('querystring')
const { API_URLS, EXPLORER_URLS, RequestStatus, VerificationStatus } = require('./constants')
const { extractCompilerVersion, enforce, enforceOrThrow } = require('../common/util')
const { getInputJSON } = require('../common/input-json')
const logger = require('../common/logger')

module.exports = async (artifact, config) => {
  const options = parseConfig(config)

  enforceOrThrow(
    artifact.networks && artifact.networks[`${options.networkId}`],
    `No instance of contract ${artifact.contractName} found for network id ${options.networkId}`
  )

  const res = await sendVerifyRequest(artifact, options)
  enforceOrThrow(res.data, `Failed to connect to Etherscan API at url ${options.apiUrl}`)

  const explorerUrl = `${EXPLORER_URLS[options.networkId]}/${artifact.networks[`${options.networkId}`].address}#contracts`

  if (res.data.result === VerificationStatus.ALREADY_VERIFIED) {
    const status = VerificationStatus.ALREADY_VERIFIED
    return { status, explorerUrl }
  }

  enforceOrThrow(res.data.status === RequestStatus.OK, res.data.result)

  const status = await verificationStatus(res.data.result, options)

  if (status === VerificationStatus.FAILED) {
    const error = VerificationStatus.FAILED
    return { status, error }
  }

  return { status, explorerUrl }
}

const parseConfig = (config) => {
  // Truffle handles network stuff, just need to get network_id
  const networkId = config.network_id
  const apiUrl = API_URLS[networkId]
  enforce(apiUrl, `Etherscan has no support for network ${config.network} with id ${networkId}`)

  const etherscanApiKey = config.api_keys && config.api_keys.etherscan
  const bscscanApiKey = config.api_keys && config.api_keys.bscscan

  const apiKey = apiUrl.includes('bscscan') && bscscanApiKey ? bscscanApiKey : etherscanApiKey
  enforce(apiKey, 'No API key specified')

  const contractsBuildDir = config.contracts_build_directory

  return { apiUrl, apiKey, networkId, contractsBuildDir }
}

const sendVerifyRequest = async (artifact, options) => {
  const compilerVersion = extractCompilerVersion(artifact)
  const encodedConstructorArgs = await fetchConstructorValues(artifact, options)
  const inputJSON = getInputJSON(artifact, options.networkId, options.contractsBuildDir)

  const postQueries = {
    apikey: options.apiKey,
    module: 'contract',
    action: 'verifysourcecode',
    contractaddress: artifact.networks[`${options.networkId}`].address,
    sourceCode: JSON.stringify(inputJSON),
    codeformat: 'solidity-standard-json-input',
    contractname: `${artifact.ast.absolutePath}:${artifact.contractName}`,
    compilerversion: compilerVersion,
    constructorArguements: encodedConstructorArgs
  }

  try {
    logger.debug('Sending verify request with POST arguments:')
    logger.debug(JSON.stringify(postQueries, null, 2))
    return await axios.post(options.apiUrl, querystring.stringify(postQueries))
  } catch (error) {
    logger.debug(error.message)
    throw new Error(`Failed to connect to Etherscan API at url ${options.apiUrl}`)
  }
}

const fetchConstructorValues = async (artifact, options) => {
  const contractAddress = artifact.networks[`${options.networkId}`].address

  // Fetch the contract creation transaction to extract the input data
  let res
  try {
    const qs = querystring.stringify({
      apiKey: options.apiKey,
      module: 'account',
      action: 'txlist',
      address: contractAddress,
      page: 1,
      sort: 'asc',
      offset: 1
    })
    const url = `${options.apiUrl}?${qs}`
    logger.debug(`Retrieving constructor parameters from ${url}`)
    res = await axios.get(url)
  } catch (error) {
    logger.debug(error.message)
    throw new Error(`Failed to connect to Etherscan API at url ${options.apiUrl}`)
  }

  // The last part of the transaction data is the constructor arguments
  // If it can't be accessed for any reason, try using empty constructor arguments
  if (res.data && res.data.status === RequestStatus.OK && res.data.result[0] !== undefined) {
    const constructorArgs = res.data.result[0].input.substring(artifact.bytecode.length)
    logger.debug(`Constructor parameters retrieved: 0x${constructorArgs}`)
    return constructorArgs
  } else {
    logger.debug('Could not retrieve constructor parameters, using empty parameters as fallback')
    return ''
  }
}

const verificationStatus = async (guid, options) => {
  logger.debug(`Checking status of verification request ${guid}`)
  // Retry API call every second until status is no longer pending
  while (true) {
    await delay(1000)

    try {
      const qs = querystring.stringify({
        apiKey: options.apiKey,
        module: 'contract',
        action: 'checkverifystatus',
        guid
      })
      const verificationResult = await axios.get(`${options.apiUrl}?${qs}`)
      if (verificationResult.data.result !== VerificationStatus.PENDING) {
        return verificationResult.data.result
      }
    } catch (error) {
      logger.debug(error.message)
      throw new Error(`Failed to connect to Etherscan API at url ${options.apiUrl}`)
    }
  }
}
