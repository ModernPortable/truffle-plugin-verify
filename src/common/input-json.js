const path = require('path')
const fs = require('fs')
const { getArtifact } = require('./util')

const getInputJSON = (artifact, networkId, contractsBuildDir) => {
  const metadata = JSON.parse(artifact.metadata)

  const libraries = getLibraries(artifact, networkId, contractsBuildDir)

  const inputJSON = {
    language: metadata.language,
    sources: metadata.sources,
    settings: {
      remappings: metadata.settings.remappings,
      optimizer: metadata.settings.optimizer,
      evmVersion: metadata.settings.evmVersion,
      libraries
    }
  }

  for (const contractPath in inputJSON.sources) {
    // If we're on Windows we need to de-Unixify the path so that Windows can read the file
    const normalisedContractPath = normaliseContractPath(contractPath)
    const absolutePath = require.resolve(normalisedContractPath)
    const content = fs.readFileSync(absolutePath, 'utf8')
    inputJSON.sources[contractPath] = { content }
  }

  return inputJSON
}

const getLibraries = (artifact, networkId, contractsBuildDir) => {
  const libraries = {
    // Example data structure of libraries object in Standard Input JSON
    // 'ConvertLib.sol': {
    //   'ConvertLib': '0x...',
    //   'OtherLibInSameSourceFile': '0x...'
    // }
  }

  const links = artifact.networks[`${networkId}`].links || {}

  for (const libraryName in links) {
    // Retrieve the source path for this library
    const libraryArtifact = getArtifact(libraryName, contractsBuildDir)
    const librarySourceFile = libraryArtifact.ast.absolutePath

    // Add the library to the object of libraries for this source path
    const librariesForSourceFile = libraries[librarySourceFile] || {}
    librariesForSourceFile[libraryName] = links[libraryName]
    libraries[librarySourceFile] = librariesForSourceFile
  }

  return libraries
}

/**
 * The metadata in the Truffle artifact file changes source paths on Windows. Instead of
 * D:\Hello\World.sol, it looks like /D/Hello/World.sol. When trying to read this path,
 * Windows cannot find it, since it is not a valid path. This function changes
 * /D/Hello/World.sol to D:\Hello\World.sol. This way, Windows is able to read these source
 * files. It does not change regular Unix paths, only Unixified Windows paths. It also does
 * not make any changes on platforms that aren't Windows.
 *
 * @param {string} contractPath path to a contract file in any format.
 * @returns {string} path to the contract in Windows format when on Windows, or Unix format otherwise.
 */
const normaliseContractPath = (contractPath) => {
  // If the current platform is not Windows, the path does not need to be changed
  if (process.platform !== 'win32') return contractPath

  // If the contract path doesn't start with '/[A-Z]/' it is not a Unixified Windows path
  if (!contractPath.match(/^\/[A-Z]\//i)) return contractPath

  const driveLetter = contractPath.substring(1, 2)
  const normalisedContractPath = path.resolve(`${driveLetter}:/${contractPath.substring(3)}`)

  return normalisedContractPath
}

module.exports = {
  getInputJSON
}
