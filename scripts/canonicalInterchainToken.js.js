const hre = require("hardhat");
const crypto = require("crypto");
const {
  AxelarQueryAPI,
  Environment,
  EvmChain,
  GasToken,
} = require("@axelar-network/axelarjs-sdk");

const interchainTokenServiceContractABI = require("../utils/interchainTokenServiceABI.json");
const interchainTokenFactoryContractABI = require("../utils/interchainTokenFactoryABI.json");
const customTokenContractABI = require("../utils/EthRandomDEXABI.json");

const MINT_BURN = 0;
const LOCK_UNLOCK = 2;

// Addresses on mainnet/testnet
const interchainTokenServiceContractAddress =
  "0xB5FB4BE02232B1bBA4dC8f81dc24C26980dE9e3C";
const interchainTokenFactoryContractAddress =
  "0x83a93500d23Fbc3e82B410aD07A6a9F7A0670D66";
const customTokenAddress = "0xD210868422e40Cfcccd0e23e678F1946B8C2B101";

async function main() {
  const functionName = process.env.FUNCTION_NAME;
  switch (functionName) {
    case "registerCanonicalInterchainToken":
      await registerCanonicalInterchainToken();
      break;
    default:
      console.error(`Unknown function: ${functionName}`);
      process.exitCode = 1;
      return;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// Register Canonical Interchain Token to the BSC chain.
async function registerCanonicalInterchainToken() {
  // Get a signer to sign the transaction
  const signer = await getSigner();

  // Create contract instances
  const interchainTokenFactoryContract = await getContractInstance(
    interchainTokenFactoryContractAddress,
    interchainTokenFactoryContractABI,
    signer,
  );
  const interchainTokenServiceContract = await getContractInstance(
    interchainTokenServiceContractAddress,
    interchainTokenServiceContractABI,
    signer,
  );

  // Register a new Canonical Interchain Token
  const deployTxData =
    await interchainTokenFactoryContract.registerCanonicalInterchainToken(
      customTokenAddress, // Your token address
    );

  // Retrieve the token ID of the newly registered token
  const tokenId =
    await interchainTokenFactoryContract.canonicalInterchainTokenId(
      customTokenAddress,
    );

  const expectedTokenManagerAddress =
    await interchainTokenServiceContract.tokenManagerAddress(tokenId);

  console.log(
    `
  Transaction Hash: ${deployTxData.hash},
  Token ID: ${tokenId},
  Expected Token Manager Address: ${expectedTokenManagerAddress},
     `,
  );
}



  async function getSigner() {
    const [signer] = await ethers.getSigners();
    return signer;
  }

  async function getContractInstance(contractAddress, contractABI, signer) {
    return new ethers.Contract(contractAddress, contractABI, signer);
  }

