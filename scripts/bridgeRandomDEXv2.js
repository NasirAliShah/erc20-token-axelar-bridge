// Import dependencies
const { ethers } = require("hardhat");
const crypto = require("crypto");
const {
  AxelarQueryAPI,
  Environment,
  EvmChain,
  GasToken,
  AxelarGMPRecoveryAPI,
} = require("@axelar-network/axelarjs-sdk");

// Load environment variables
require("dotenv").config();

// ABIs for the contracts
const interchainTokenServiceContractABI = require("../utils/interchainTokenServiceABIN.json");
const baseRandomDEXTokenABI = require("../utils/RandomDEXABI.json");
const ethRandomDEXTokenABI = require("../utils/EthRandomDEXABI.json");

// Constants
const MINT_BURN = 4;
const LOCK_UNLOCK = 2;

// Contract addresses
const interchainTokenServiceContractAddress = process.env.INTERCHAIN_SERVICE_CONTRACT_ADDRESS;
const baseRandomDEXTokenAddress = process.env.BASE_RANDOMDEX_CONTRACT_ADDRESS;
const ethRandomDEXTokenAddress = process.env.ETH_RANDOMDEX_CONTRACT_ADDRESS;

// Initialize Axelar APIs
const api = new AxelarQueryAPI({ environment: Environment.TESTNET });
const gmpRecoveryApi = new AxelarGMPRecoveryAPI({ environment: Environment.TESTNET });

// Utility to create a signer instance
async function getSigner(rpcUrl, privateKey) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return new ethers.Wallet(privateKey, provider);
}

// Utility to create a contract instance
async function getContractInstance(contractAddress, contractABI, signer) {
  return new ethers.Contract(contractAddress, contractABI, signer);
}

// Updated gas estimator with recovery API
async function gasEstimator(sourceChain, destinationChain, tokenSymbol = "aETH") {
  try {
    const gas = await api.estimateGasFee({
      source: sourceChain,
      destination: destinationChain,
      sourceToken: tokenSymbol,
      amount: "1000000", // 1M units
      destinationToken: tokenSymbol
    });
    return gas;
  } catch (error) {
    handleError("Error estimating gas", error);
    throw error;
  }
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
    const abiCoder = new ethers.AbiCoder();
    const params = abiCoder.encode(
      ["address", "address"],
      [await signer.getAddress(), baseRandomDEXTokenAddress]
    );

    const gasAmount = await gasEstimator(
      "base-sepolia",
      "ethereum-sepolia",
      "aETH"
    );

    const registerTx = await interchainTokenServiceContract.registerCustomToken(
      salt,
      baseRandomDEXTokenAddress,
      LOCK_UNLOCK,
      params,
      { value: gasAmount }
    );

    console.log("Register Custom Token Transaction Hash:", registerTx.hash);
    const receipt = await registerTx.wait();

    const tokenId = await interchainTokenServiceContract.interchainTokenId(signer.address, salt);
    const tokenManagerAddress = await interchainTokenServiceContract.tokenManagerAddress(tokenId);

    console.log(`
      Token Manager deployed on Base:
      Salt: ${salt}
      Token ID: ${tokenId}
      Token Manager Address: ${tokenManagerAddress}
    `);

    return { tokenId, salt, tokenManagerAddress };
  } catch (error) {
    handleError("Error deploying Token Manager on Base", error);
    throw error;
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

    const abiCoder = new ethers.AbiCoder();
    const linkParams = abiCoder.encode(
      ["address", "address"],
      [await signer.getAddress(), ethRandomDEXTokenAddress]
    );

    const gasAmount = await gasEstimator(
      "base-sepolia",
      "ethereum-sepolia",
      "aETH"
    );

    const linkTx = await interchainTokenServiceContract.linkToken(
      process.env.TOKEN_SALT,
      "ethereum-sepolia",
      ethers.zeroPadValue(ethRandomDEXTokenAddress, 32),
      MINT_BURN,
      linkParams,
      gasAmount,
      { value: gasAmount }
    );

    console.log("Link Token Transaction Hash:", linkTx.hash);
    await linkTx.wait();

    const tokenId = process.env.TOKEN_ID;
    const tokenManagerAddress = await interchainTokenServiceContract.tokenManagerAddress(tokenId);

    console.log(`
      Token Manager deployed on Ethereum:
      Token ID: ${tokenId}
      Token Manager Address: ${tokenManagerAddress}
    `);

    return { tokenId, tokenManagerAddress };
  } catch (error) {
    handleError("Error deploying Token Manager on Ethereum", error);
    throw error;
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

    const tokenManagerAddress = process.env.TOKEN_MANAGER_ETH_ADDRESS;

    // Grant MINT_ROLE
    const minterRole = await tokenContract.MINT_ROLE();
    console.log("Granting MINT_ROLE to token manager:", tokenManagerAddress);
    const grantMinterTx = await tokenContract.grantRole(minterRole, tokenManagerAddress);
    await grantMinterTx.wait();

    // Grant BURN_ROLE
    const burnRole = await tokenContract.BURN_ROLE();
    console.log("Granting BURN_ROLE to token manager:", tokenManagerAddress);
    const grantBurnTx = await tokenContract.grantRole(burnRole, tokenManagerAddress);
    await grantBurnTx.wait();

    console.log("Successfully granted MINT_ROLE and BURN_ROLE to token manager");
  } catch (error) {
    handleError("Error granting roles to token manager on Ethereum", error);
    throw error;
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

    const tokenManagerAddress = process.env.TOKEN_MANAGER_BASE_ADDRESS;
    const maxAmount = ethers.MaxUint256;

    console.log("Approving tokens for token manager:", tokenManagerAddress);
    const approveTx = await tokenContract.approve(tokenManagerAddress, maxAmount);
    await approveTx.wait();

    console.log("Successfully approved tokens for token manager");
  } catch (error) {
    handleError("Error approving tokens on Base", error);
    throw error;
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

    const amount = process.env.TRANSFER_AMOUNT || ethers.parseEther("1.0");
    const gasAmount = await gasEstimator(
      "base-sepolia",
      "ethereum-sepolia",
      "aETH"
    );

    const destinationAddress = ethers.zeroPadValue(await signer.getAddress(), 32);
    const metadata = "0x";

    const transferTx = await interchainTokenServiceContract.interchainTransfer(
      process.env.TOKEN_ID,
      "ethereum-sepolia",
      destinationAddress,
      amount,
      metadata,
      gasAmount,
      { value: gasAmount }
    );

    console.log("Transfer Transaction Hash:", transferTx.hash);
    const receipt = await transferTx.wait();

    // Monitor transfer status
    const transferStatus = await gmpRecoveryApi.queryTransactionStatus(receipt.hash);
    console.log("Transfer Status:", transferStatus);

    console.log(`Successfully initiated transfer of ${amount} tokens from Base to Ethereum`);
    return receipt.hash;
  } catch (error) {
    handleError("Error transferring tokens from Base to Ethereum", error);
    throw error;
  }
}

// Transfer tokens from Ethereum to Base
async function transferTokensEthToBase() {
  try {
    const signer = await getSigner(process.env.ETHEREUM_TESTNET_RPC, process.env.PRIVATE_KEY);
    const interchainTokenServiceContract = await getContractInstance(
      interchainTokenServiceContractAddress,
      interchainTokenServiceContractABI,
      signer
    );

    const amount = process.env.TRANSFER_AMOUNT || ethers.parseEther("1.0");
    const gasAmount = await gasEstimator(
      "ethereum-sepolia",
      "base-sepolia",
      "aETH"
    );

    const destinationAddress = ethers.zeroPadValue(await signer.getAddress(), 32);
    const metadata = "0x";

    const transferTx = await interchainTokenServiceContract.interchainTransfer(
      process.env.TOKEN_ID,
      "base-sepolia",
      destinationAddress,
      amount,
      metadata,
      gasAmount,
      { value: gasAmount }
    );

    console.log("Transfer Transaction Hash:", transferTx.hash);
    const receipt = await transferTx.wait();

    // Monitor transfer status
    const transferStatus = await gmpRecoveryApi.queryTransactionStatus(receipt.hash);
    console.log("Transfer Status:", transferStatus);

    console.log(`Successfully initiated transfer of ${amount} tokens from Ethereum to Base`);
    return receipt.hash;
  } catch (error) {
    handleError("Error transferring tokens from Ethereum to Base", error);
    throw error;
  }
}

// Check gas estimation between chains
async function checkGasEstimation() {
  try {
    // Check gas for Base to Ethereum transfer
    const baseToEthGas = await gasEstimator(
      "base-sepolia",
      "ethereum-sepolia",
      "aETH"
    );
    console.log('Estimated gas fee (Base -> Ethereum):', baseToEthGas);

    // Check gas for Ethereum to Base transfer
    const ethToBaseGas = await gasEstimator(
      "ethereum-sepolia",
      "base-sepolia",
      "aETH"
    );
    console.log('Estimated gas fee (Ethereum -> Base):', ethToBaseGas);

    return { baseToEthGas, ethToBaseGas };
  } catch (error) {
    handleError('Error checking gas estimation', error);
    throw error;
  }
}

// Error handler
function handleError(message, error) {
  console.error(`${message}:`, error);
  console.error("Error details:", {
    name: error.name,
    message: error.message,
    stack: error.stack,
    code: error.code,
    data: error.data
  });
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
    case "transferTokensEthToBase":
      await transferTokensEthToBase();
      break;
    case "checkGasEstimation":
      await checkGasEstimation();
      break;
    default:
      console.error(`Unknown function: ${functionName}`);
      process.exitCode = 1;
  }
}

// Export functions for testing and individual usage
module.exports = {
  deployTokenManagerBase,
  deployRemoteTokenManager,
  transferMintAccessToTokenManagerOnEth,
  approveTokensOnBase,
  transferTokensBaseToEth,
  transferTokensEthToBase,
  main
};

// Execute main function if running directly
if (require.main === module) {
  main().catch((error) => handleError("Unhandled error in main function", error));
}
