// Import dependencies
const { ethers } = require("hardhat");
const crypto = require("crypto");
const {
  AxelarQueryAPI,
  Environment,
  EvmChain,
  GasToken,
} = require("@axelar-network/axelarjs-sdk");

// Load environment variables
require("dotenv").config();

// ABIs for the contracts
const interchainTokenServiceContractABI = require("../utils/interchainTokenServiceABI.json");
const baseRandomDEXTokenABI = require("../utils/RandomDEXABI.json");
const ethRandomDEXTokenABI = require("../utils/ethRandomDEXTokenABI.json");

// Roles
const MINT_BURN = 4; // Mint and burn roles on Ethereum side
const LOCK_UNLOCK = 2; // Lock and unlock roles on Base side

// Contract addresses
const interchainTokenServiceContractAddress = process.env.INTERCHAIN_SERVICE_CONTRACT_ADDRESS; // Axelar Interchain Token Service
const baseRandomDEXTokenAddress = process.env.BASE_RANDOMDEX_CONTRACT_ADDRESS; // Base contract address
const ethRandomDEXTokenAddress = process.env.ETH_RANDOMDEX_CONTRACT_ADDRESS; // Ethereum contract address

// Utility to create a signer instance
async function getSigner(rpcUrl, privateKey) {
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  return new ethers.Wallet(privateKey, provider);
}

// Utility to create a contract instance
async function getContractInstance(contractAddress, contractABI, signer) {
  return new ethers.Contract(contractAddress, contractABI, signer);
}

// Deploy token manager for Base blockchain
async function deployTokenManagerBase() {
  try {
    const signer = await getSigner(process.env.BASE_SEPOLIA_RPC_URL, process.env.PRIVATE_KEY);

    const interchainTokenServiceContract = await getContractInstance(
      interchainTokenServiceContractAddress,
      interchainTokenServiceContractABI,
      signer
    );

    const salt = "0x" + crypto.randomBytes(32).toString("hex");

    const params = ethers.utils.defaultAbiCoder.encode(
      ["bytes", "address"],
      [signer.address, baseRandomDEXTokenAddress]
    );

    const deployTx = await interchainTokenServiceContract.deployTokenManager(
      salt,
      "",
      LOCK_UNLOCK,
      params,
      ethers.utils.parseEther("0.01")
    );

    console.log("Deploy Transaction Hash:", deployTx.hash);

    const tokenId = await interchainTokenServiceContract.interchainTokenId(signer.address, salt);
    const tokenManagerAddress = await interchainTokenServiceContract.tokenManagerAddress(tokenId);

    console.log(`
      Token Manager successfully deployed on Base:
      Salt: ${salt},
      Token ID: ${tokenId},
      Token Manager Address: ${tokenManagerAddress}
    `);
  } catch (error) {
    handleError("Error deploying Token Manager on Base", error);
  }
}

// Gas estimator
const api = new AxelarQueryAPI({ environment: Environment.TESTNET });

async function gasEstimator() {
  try {
    const gas = await api.estimateGasFee(
      EvmChain.BASE_SEPOLIA,
      EvmChain.SEPOLIA,
      900000,
      1.1,
      GasToken.ETH
    );
    return gas;
  } catch (error) {
    handleError("Error estimating gas", error);
  }
}

// Deploy token manager for Ethereum blockchain
async function deployRemoteTokenManager() {
  try {
    const signer = await getSigner(process.env.BASE_SEPOLIA_RPC_URL, process.env.PRIVATE_KEY);

    const interchainTokenServiceContract = await getContractInstance(
      interchainTokenServiceContractAddress,
      interchainTokenServiceContractABI,
      signer
    );

    const params = ethers.utils.defaultAbiCoder.encode(
      ["bytes", "address"],
      [signer.address, ethRandomDEXTokenAddress]
    );

    const gasAmount = await gasEstimator();

    const deployTx = await interchainTokenServiceContract.deployTokenManager(
      process.env.TOKEN_SALT, // Salt from Base deployment
      "ethereum-sepolia",
      MINT_BURN,
      params,
      gasAmount,
      { value: gasAmount }
    );

    console.log("Deploy Transaction Hash:", deployTx.hash);

    const tokenId = await interchainTokenServiceContract.interchainTokenId(
      signer.address,
      process.env.TOKEN_SALT
    );

    const tokenManagerAddress = await interchainTokenServiceContract.tokenManagerAddress(tokenId);

    console.log(`
      Token Manager successfully deployed on Ethereum:
      Token ID: ${tokenId},
      Token Manager Address: ${tokenManagerAddress}
    `);
  } catch (error) {
    handleError("Error deploying Token Manager on Ethereum", error);
  }
}

// Grant mint/burn access on Ethereum
async function transferMintAccessToTokenManagerOnEth() {
  try {
    const signer = await getSigner(process.env.ETHEREUM_TESTNET_RPC, process.env.PRIVATE_KEY);

    const tokenContract = await getContractInstance(
      ethRandomDEXTokenAddress,
      ethRandomDEXTokenABI,
      signer
    );

    const minterRole = await tokenContract.MINT_ROLE();
    const burnRole = await tokenContract.BURN_ROLE();

    const grantMinterTx = await tokenContract.grantRole(
      minterRole,
      process.env.TOKEN_MANAGER_ETH_ADDRESS // Token Manager Address for Ethereum
    );
    console.log("Grant Minter Role Transaction Hash:", grantMinterTx.hash);

    const grantBurnTx = await tokenContract.grantRole(
      burnRole,
      process.env.TOKEN_MANAGER_ETH_ADDRESS // Token Manager Address for Ethereum
    );
    console.log("Grant Burn Role Transaction Hash:", grantBurnTx.hash);
  } catch (error) {
    handleError("Error transferring mint access on Ethereum", error);
  }
}

// Approve tokens for transfer on Base
async function approveTokensOnBase() {
  try {
    const signer = await getSigner(process.env.BASE_SEPOLIA_RPC_URL, process.env.PRIVATE_KEY);

    const tokenContract = await getContractInstance(
      baseRandomDEXTokenAddress,
      baseRandomDEXTokenABI,
      signer
    );

    const approveTx = await tokenContract.approve(
      interchainTokenServiceContractAddress,
      ethers.utils.parseEther("500")
    );
    console.log("Approve Transaction Hash:", approveTx.hash);
  } catch (error) {
    handleError("Error approving tokens on Base", error);
  }
}

// Transfer tokens from Base to Ethereum
async function transferTokensBaseToEth() {
  try {
    const signer = await getSigner(process.env.BASE_SEPOLIA_RPC_URL, process.env.PRIVATE_KEY);

    const interchainTokenServiceContract = await getContractInstance(
      interchainTokenServiceContractAddress,
      interchainTokenServiceContractABI,
      signer
    );

    const gasAmount = await gasEstimator();

    const transferTx = await interchainTokenServiceContract.interchainTransfer(
      process.env.TOKEN_ID,
      "ethereum-sepolia",
      process.env.ETHEREUM_RECEIVER_ADDRESS,
      ethers.utils.parseEther("10"),
      "0x",
      gasAmount,
      { value: gasAmount }
    );

    console.log("Transfer Transaction Hash:", transferTx.hash);
  } catch (error) {
    handleError("Error transferring tokens from Base to Ethereum", error);
  }
}

// Handle errors
function handleError(message, error) {
  console.error(`${message}:\n`, error.message || error);
  if (error.data) console.error("Error Data:", error.data);
  process.exitCode = 1;
}

// Main entry point
async function main() {
  const functionName = process.env.FUNCTION_NAME;
  switch (functionName) {
    case "deployTokenManagerBase":
      await deployTokenManagerBase();
      break;
    case "deployRemoteTokenManager":
      await deployRemoteTokenManager();
      break;
    case "transferMintAccessToTokenManagerOnEth":
      await transferMintAccessToTokenManagerOnEth();
      break;
    case "approveTokensOnBase":
      await approveTokensOnBase();
      break;
    case "transferTokensBaseToEth":
      await transferTokensBaseToEth();
      break;
    default:
      console.error(`Unknown function: ${functionName}`);
      process.exitCode = 1;
  }
}

main().catch((error) => handleError("Unhandled error in main function", error));
